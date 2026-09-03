## Default Permission

Разрешает обе команды плагина — проверку доступности точного alarm
(`canScheduleExactAlarms()`) и открытие системных настроек для его
предоставления (05§3.1, ADR-0008).

#### Granted Permissions

Полный набор — у плагина всего две команды, ни у одной нет
дифференцированного доступа (обе безопасны для вызова из WebView без
дополнительного scope).

#### This default permission set includes the following:

- `allow-can-schedule-exact`
- `allow-open-exact-alarm-settings`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`alarm-capability:allow-can-schedule-exact`

</td>
<td>

Enables the can_schedule_exact command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`alarm-capability:deny-can-schedule-exact`

</td>
<td>

Denies the can_schedule_exact command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`alarm-capability:allow-open-exact-alarm-settings`

</td>
<td>

Enables the open_exact_alarm_settings command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`alarm-capability:deny-open-exact-alarm-settings`

</td>
<td>

Denies the open_exact_alarm_settings command without any pre-configured scope.

</td>
</tr>
</table>
