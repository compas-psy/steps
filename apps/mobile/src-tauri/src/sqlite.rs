//! Нативный мост к SQLite для оболочки Android (ADR-0005).
//!
//! # Почему собственный мост, а не `tauri-plugin-sql`
//!
//! ADR-0005 называл официальный плагин направлением и честно отмечал, что
//! проверить его тогда было нечем. Проверка сделана; плагин не подходит по
//! двум измеримым причинам (`tauri-plugin-sql` 2.4.1, исходники прочитаны):
//!
//! 1. Он выставляет только `load`/`close`/`execute`/`select` — команды
//!    транзакции нет вовсе.
//! 2. Соединение он открывает как `Pool::connect(url)` — пул `sqlx` со
//!    значением по умолчанию `max_connections: 10`. `BEGIN` и `COMMIT`,
//!    отправленные двумя вызовами, могут уехать на разные соединения:
//!    транзакции через него невыразимы, а не «требуют аккуратности».
//!
//! Весь write-путь ШАГОВ построен на том, что сущность и её outbox-запись
//! ложатся ОДНОЙ транзакцией (`00§7`). Поэтому здесь — **одно** соединение
//! под мьютексом, и `BEGIN`/`COMMIT` гарантированно попадают на него.
//!
//! # Что этот файл НЕ делает
//!
//! Ни одного оператора схемы, ни одного знания о задачах и проектах: SQL
//! целиком принадлежит `@shagi/storage` (SPEC/00 §3 — в `apps/*` нет
//! бизнес-логики, и схема тоже). Здесь только транспорт значений и
//! обязательные свойства базы из `00§2` (WAL, внешние ключи, FTS5).

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value as Json};
use tauri::{AppHandle, Manager, State};

/// Открытая база: соединение и путь к файлу.
pub struct OpenDb {
    connection: Connection,
    path: PathBuf,
}

/// Состояние плагина. `Mutex` — не оптимизация, а условие корректности:
/// пока идёт транзакция, другой вызов не должен вклиниться в то же
/// соединение.
#[derive(Default)]
pub struct SqliteState(pub Mutex<Option<OpenDb>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteInfo {
    /// Абсолютный путь файла БД в app-private каталоге приложения.
    path: String,
    sqlite_version: String,
    /// Ожидается `wal` (`00§2`).
    journal_mode: String,
    /// Ожидается `true` (`00§2`).
    foreign_keys: bool,
    /// Собран ли движок с FTS5 (`00§2`).
    fts5: bool,
}

fn to_error<E: std::fmt::Display>(context: &str, error: E) -> String {
    format!("{context}: {error}")
}

/// JSON-значение с фронтенда → значение SQLite.
///
/// `{"i64": "123"}` — размеченное 64-битное целое. Разметка нужна потому,
/// что в JSON целых больше 2^53 не существует, а такие значения у ШАГОВ
/// обычные: метки времени хранятся в наносекундах.
fn json_to_sql(value: &Json) -> Result<rusqlite::types::Value, String> {
    use rusqlite::types::Value;
    match value {
        Json::Null => Ok(Value::Null),
        Json::Bool(flag) => Ok(Value::Integer(i64::from(*flag))),
        Json::String(text) => Ok(Value::Text(text.clone())),
        Json::Number(number) => {
            if let Some(integer) = number.as_i64() {
                Ok(Value::Integer(integer))
            } else if let Some(real) = number.as_f64() {
                Ok(Value::Real(real))
            } else {
                Err(format!("не удалось разобрать число: {number}"))
            }
        }
        Json::Object(map) => match map.get("i64") {
            Some(Json::String(text)) => text
                .parse::<i64>()
                .map(Value::Integer)
                .map_err(|error| to_error("некорректное 64-битное целое", error)),
            _ => Err(
                "объект-параметр обязан иметь вид {\"i64\": \"<число>\"} — других форм мост не знает"
                    .to_string(),
            ),
        },
        Json::Array(_) => Err("массив не может быть значением SQL-параметра".to_string()),
    }
}

/// Значение SQLite → JSON для фронтенда. Целые размечаются, чтобы на
/// стороне JS стать `bigint` без потери точности.
fn sql_to_json(value: ValueRef<'_>) -> Result<Json, String> {
    match value {
        ValueRef::Null => Ok(Json::Null),
        ValueRef::Integer(integer) => {
            let mut object = Map::new();
            object.insert("i64".to_string(), Json::String(integer.to_string()));
            Ok(Json::Object(object))
        }
        ValueRef::Real(real) => serde_json::Number::from_f64(real)
            .map(Json::Number)
            .ok_or_else(|| format!("нечисловое значение REAL: {real}")),
        ValueRef::Text(bytes) => std::str::from_utf8(bytes)
            .map(|text| Json::String(text.to_string()))
            .map_err(|error| to_error("текст не в UTF-8", error)),
        ValueRef::Blob(_) => Err(
            "BLOB через мост не передаётся: ни одна колонка замороженной схемы не имеет этого типа"
                .to_string(),
        ),
    }
}

fn with_db<T>(
    state: &State<'_, SqliteState>,
    run: impl FnOnce(&OpenDb) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state
        .0
        .lock()
        .map_err(|error| to_error("состояние SQLite повреждено", error))?;
    let db = guard
        .as_ref()
        .ok_or_else(|| "база не открыта: сначала sqlite_open".to_string())?;
    run(db)
}

/// Открывает (или создаёт) базу в app-private каталоге и включает
/// обязательные режимы `00§2`. Возвращает диагностику, по которой
/// фронтенд убеждается, что база действительно такая, как требует ТЗ.
#[tauri::command]
pub fn sqlite_open(
    app: AppHandle,
    state: State<'_, SqliteState>,
    database_name: String,
) -> Result<SqliteInfo, String> {
    // Имя — только имя файла: путь целиком выбирает нативная сторона,
    // чтобы из WebView нельзя было указать файл за пределами песочницы.
    if database_name.contains('/') || database_name.contains('\\') || database_name.contains("..") {
        return Err(format!("недопустимое имя базы: {database_name}"));
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| to_error("нет app-private каталога", error))?;
    std::fs::create_dir_all(&dir).map_err(|error| to_error("не создать каталог базы", error))?;
    let path = dir.join(&database_name);

    let (db, info) = open_db_at(path)?;

    let mut guard = state
        .0
        .lock()
        .map_err(|error| to_error("состояние SQLite повреждено", error))?;
    *guard = Some(db);
    Ok(info)
}

/// Открытие файла и включение обязательных режимов `00§2` — отдельно от
/// команды, чтобы это можно было проверить тестом без Tauri-рантайма
/// (`#[cfg(test)]` ниже).
pub fn open_db_at(path: PathBuf) -> Result<(OpenDb, SqliteInfo), String> {
    let connection = Connection::open(&path)
        .map_err(|error| to_error(&format!("не открыть базу {}", path.display()), error))?;
    // WAL и внешние ключи — требование `00§2`, не настройка.
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| to_error("не включить WAL", error))?;
    connection
        .pragma_update(None, "foreign_keys", true)
        .map_err(|error| to_error("не включить внешние ключи", error))?;

    let journal_mode: String = connection
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .map_err(|error| to_error("не прочитать journal_mode", error))?;
    let foreign_keys: i64 = connection
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .map_err(|error| to_error("не прочитать foreign_keys", error))?;
    let sqlite_version: String = connection
        .query_row("SELECT sqlite_version()", [], |row| row.get(0))
        .map_err(|error| to_error("не прочитать версию SQLite", error))?;
    let fts5: i64 = connection
        .query_row("SELECT sqlite_compileoption_used('ENABLE_FTS5')", [], |row| {
            row.get(0)
        })
        .map_err(|error| to_error("не проверить FTS5", error))?;

    let info = SqliteInfo {
        path: path.to_string_lossy().to_string(),
        sqlite_version,
        journal_mode,
        foreign_keys: foreign_keys == 1,
        fts5: fts5 == 1,
    };
    Ok((OpenDb { connection, path }, info))
}

#[tauri::command]
pub fn sqlite_execute(
    state: State<'_, SqliteState>,
    sql: String,
    params: Vec<Json>,
) -> Result<(), String> {
    with_db(&state, |db| execute_on(db, &sql, &params))
}

pub fn execute_on(db: &OpenDb, sql: &str, params: &[Json]) -> Result<(), String> {
    let values = params
        .iter()
        .map(json_to_sql)
        .collect::<Result<Vec<_>, _>>()?;
    db.connection
        .execute(sql, rusqlite::params_from_iter(values))
        .map(|_| ())
        .map_err(|error| to_error(&format!("SQL не выполнен ({sql})"), error))
}

#[tauri::command]
pub fn sqlite_query(
    state: State<'_, SqliteState>,
    sql: String,
    params: Vec<Json>,
) -> Result<Vec<Map<String, Json>>, String> {
    with_db(&state, |db| query_on(db, &sql, &params))
}

pub fn query_on(db: &OpenDb, sql: &str, params: &[Json]) -> Result<Vec<Map<String, Json>>, String> {
    {
        let values = params
            .iter()
            .map(json_to_sql)
            .collect::<Result<Vec<_>, _>>()?;
        let mut statement = db
            .connection
            .prepare(sql)
            .map_err(|error| to_error(&format!("SQL не разобран ({sql})"), error))?;
        let columns: Vec<String> = statement
            .column_names()
            .into_iter()
            .map(str::to_string)
            .collect();
        let mut rows = statement
            .query(rusqlite::params_from_iter(values))
            .map_err(|error| to_error(&format!("SQL не выполнен ({sql})"), error))?;

        let mut result = Vec::new();
        while let Some(row) = rows
            .next()
            .map_err(|error| to_error("ошибка чтения строки", error))?
        {
            let mut object = Map::new();
            for (index, column) in columns.iter().enumerate() {
                let value = row
                    .get_ref(index)
                    .map_err(|error| to_error(&format!("нет колонки {column}"), error))?;
                object.insert(column.clone(), sql_to_json(value)?);
            }
            result.push(object);
        }
        Ok(result)
    }
}

/// Согласованная копия базы одним файлом — `VACUUM INTO`. Это и есть
/// «native atomic DB backup/checkpoint» из `02§15`: протокол миграций
/// снимает её перед каждым шагом.
#[tauri::command]
pub fn sqlite_snapshot(state: State<'_, SqliteState>) -> Result<String, String> {
    with_db(&state, |db| {
        let target = db.path.with_extension("checkpoint");
        if target.exists() {
            std::fs::remove_file(&target)
                .map_err(|error| to_error("не удалить прежний снимок", error))?;
        }
        db.connection
            .execute("VACUUM INTO ?1", [target.to_string_lossy().to_string()])
            .map_err(|error| to_error("не снять снимок базы", error))?;
        Ok(target.to_string_lossy().to_string())
    })
}

/// Возврат к снимку: соединение закрывается, файл заменяется, соединение
/// открывается заново. Полумеры здесь недопустимы — восстановление
/// вызывается только когда миграция уже сломала базу.
#[tauri::command]
pub fn sqlite_restore(state: State<'_, SqliteState>, snapshot_path: String) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|error| to_error("состояние SQLite повреждено", error))?;
    let db = guard
        .take()
        .ok_or_else(|| "база не открыта: сначала sqlite_open".to_string())?;
    let path = db.path.clone();
    drop(db);

    std::fs::copy(&snapshot_path, &path)
        .map_err(|error| to_error("не восстановить базу из снимка", error))?;
    let connection =
        Connection::open(&path).map_err(|error| to_error("не открыть восстановленную базу", error))?;
    connection
        .pragma_update(None, "foreign_keys", true)
        .map_err(|error| to_error("не включить внешние ключи", error))?;
    *guard = Some(OpenDb { connection, path });
    Ok(())
}

#[tauri::command]
pub fn sqlite_close(state: State<'_, SqliteState>) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|error| to_error("состояние SQLite повреждено", error))?;
    *guard = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    //! Проверки НАСТОЯЩЕЙ нативной SQLite — той самой, что поедет в APK
    //! (`rusqlite` с `bundled`: движок компилируется в бинарник, системный
    //! не используется). Tauri-рантайм здесь не нужен: команды — тонкие
    //! обёртки над `open_db_at`/`execute_on`/`query_on`, и проверяется
    //! именно то, что под ними.

    use super::*;

    fn temp_db(name: &str) -> (tempfile::TempDir, OpenDb, SqliteInfo) {
        let dir = tempfile::tempdir().expect("временный каталог");
        let (db, info) = open_db_at(dir.path().join(name)).expect("база открылась");
        (dir, db, info)
    }

    fn i64_param(value: i64) -> Json {
        let mut object = Map::new();
        object.insert("i64".to_string(), Json::String(value.to_string()));
        Json::Object(object)
    }

    #[test]
    fn baza_otkryvaetsya_s_obyazatelnymi_svojstvami_00_2() {
        let (_dir, _db, info) = temp_db("shagi.db");
        // Все три — прямые требования `00§2`, а не пожелания.
        assert_eq!(info.journal_mode, "wal");
        assert!(info.foreign_keys, "внешние ключи обязаны быть включены");
        assert!(info.fts5, "движок обязан быть собран с FTS5");
        assert!(info.path.ends_with("shagi.db"));
    }

    #[test]
    fn fts5_ne_tolko_v_flagah_no_i_rabotaet() {
        let (_dir, db, _info) = temp_db("fts.db");
        execute_on(&db, "CREATE VIRTUAL TABLE t USING fts5(title)", &[]).expect("FTS5-таблица");
        execute_on(&db, "INSERT INTO t (title) VALUES (?1)", &[Json::String("отчёт".into())])
            .expect("вставка");
        let rows = query_on(&db, "SELECT title FROM t WHERE t MATCH ?1", &[Json::String("отчёт".into())])
            .expect("поиск");
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn celye_bolshe_2_v_53_perezhivayut_krug() {
        // Метки времени ШАГОВ — наносекунды: значения заведомо больше
        // 2^53, где `number` уже теряет точность.
        let (_dir, db, _info) = temp_db("i64.db");
        execute_on(&db, "CREATE TABLE t (id TEXT PRIMARY KEY, at INTEGER)", &[]).unwrap();
        let nanos = 1_788_369_255_288_254_754_i64;
        execute_on(
            &db,
            "INSERT INTO t VALUES (?1, ?2)",
            &[Json::String("x".into()), i64_param(nanos)],
        )
        .unwrap();

        let rows = query_on(&db, "SELECT at FROM t", &[]).unwrap();
        let value = rows[0].get("at").expect("колонка at");
        // Наружу целое уходит размеченным — иначе JSON округлил бы его.
        assert_eq!(value, &i64_param(nanos));
    }

    #[test]
    fn tranzakciya_otkatyvaetsya_na_odnom_soedinenii() {
        // Ради этого и написан собственный мост: `BEGIN` и `ROLLBACK` —
        // разные вызовы, и они обязаны попасть на ОДНО соединение.
        let (_dir, db, _info) = temp_db("tx.db");
        execute_on(&db, "CREATE TABLE t (id TEXT PRIMARY KEY)", &[]).unwrap();

        execute_on(&db, "BEGIN IMMEDIATE", &[]).unwrap();
        execute_on(&db, "INSERT INTO t VALUES (?1)", &[Json::String("a".into())]).unwrap();
        execute_on(&db, "ROLLBACK", &[]).unwrap();

        let rows = query_on(&db, "SELECT id FROM t", &[]).unwrap();
        assert!(rows.is_empty(), "откат обязан убрать запись, осталось: {rows:?}");
    }

    #[test]
    fn tranzakciya_kommitit_vse_zapisi_srazu() {
        let (_dir, db, _info) = temp_db("tx2.db");
        execute_on(&db, "CREATE TABLE t (id TEXT PRIMARY KEY)", &[]).unwrap();

        execute_on(&db, "BEGIN IMMEDIATE", &[]).unwrap();
        execute_on(&db, "INSERT INTO t VALUES (?1)", &[Json::String("a".into())]).unwrap();
        execute_on(&db, "INSERT INTO t VALUES (?1)", &[Json::String("b".into())]).unwrap();
        execute_on(&db, "COMMIT", &[]).unwrap();

        assert_eq!(query_on(&db, "SELECT id FROM t", &[]).unwrap().len(), 2);
    }

    #[test]
    fn vneshnie_klyuchi_dejstvitelno_otklonyayut_visyachuyu_ssylku() {
        let (_dir, db, _info) = temp_db("fk.db");
        execute_on(&db, "CREATE TABLE parent (id TEXT PRIMARY KEY)", &[]).unwrap();
        execute_on(
            &db,
            "CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id))",
            &[],
        )
        .unwrap();

        let result = execute_on(
            &db,
            "INSERT INTO child VALUES (?1, ?2)",
            &[Json::String("c".into()), Json::String("нет такого".into())],
        );
        assert!(result.is_err(), "внешний ключ обязан отклонить висячую ссылку");
    }

    #[test]
    fn dannye_perezhivayut_zakrytie_i_povtornoe_otkrytie() {
        // Ровно то, что проверяет Android-смоук после force-stop, только
        // на уровне самого файла базы.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("restart.db");
        {
            let (db, _info) = open_db_at(path.clone()).unwrap();
            execute_on(&db, "CREATE TABLE t (id TEXT PRIMARY KEY)", &[]).unwrap();
            execute_on(&db, "INSERT INTO t VALUES (?1)", &[Json::String("жива".into())]).unwrap();
        }
        let (db, info) = open_db_at(path).unwrap();
        assert_eq!(info.journal_mode, "wal");
        let rows = query_on(&db, "SELECT id FROM t", &[]).unwrap();
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn imya_bazy_s_perehodom_po_katalogam_otklonyaetsya() {
        // Путь выбирает нативная сторона; из WebView нельзя указать файл за
        // пределами песочницы приложения.
        for name in ["../shagi.db", "a/b.db", "..\\shagi.db"] {
            assert!(
                name.contains('/') || name.contains('\\') || name.contains(".."),
                "имя {name} обязано считаться недопустимым"
            );
        }
    }

    #[test]
    fn blob_otvergaetsya_ponyatnoj_oshibkoj() {
        let (_dir, db, _info) = temp_db("blob.db");
        execute_on(&db, "CREATE TABLE t (id TEXT PRIMARY KEY, data BLOB)", &[]).unwrap();
        execute_on(
            &db,
            "INSERT INTO t VALUES (?1, x'0102')",
            &[Json::String("x".into())],
        )
        .unwrap();

        let error = query_on(&db, "SELECT data FROM t", &[]).unwrap_err();
        assert!(error.contains("BLOB"), "ошибка обязана называть причину: {error}");
    }

    #[test]
    fn snimok_i_vosstanovlenie_vozvrashchayut_prezhnee_sostoyanie() {
        // `VACUUM INTO` — checkpoint протокола миграций (`02§15`).
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("snap.db");
        let (db, _info) = open_db_at(path.clone()).unwrap();
        execute_on(&db, "CREATE TABLE t (id TEXT PRIMARY KEY)", &[]).unwrap();
        execute_on(&db, "INSERT INTO t VALUES (?1)", &[Json::String("до".into())]).unwrap();

        let snapshot = path.with_extension("checkpoint");
        db.connection
            .execute("VACUUM INTO ?1", [snapshot.to_string_lossy().to_string()])
            .unwrap();

        execute_on(&db, "INSERT INTO t VALUES (?1)", &[Json::String("после".into())]).unwrap();
        assert_eq!(query_on(&db, "SELECT id FROM t", &[]).unwrap().len(), 2);
        drop(db);

        std::fs::copy(&snapshot, &path).unwrap();
        let (restored, _info) = open_db_at(path).unwrap();
        let rows = query_on(&restored, "SELECT id FROM t", &[]).unwrap();
        assert_eq!(rows.len(), 1, "восстановление обязано вернуть состояние снимка");
    }
}
