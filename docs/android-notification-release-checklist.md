# Android notification release checklist

## Incorrect notification ages

The mobile project does not construct background FCM notifications and does not
set Android's `Notification.when`. Firebase displays notification payloads while
the app is backgrounded or closed. The screenshots therefore cannot be fixed by
changing text in the React Native notifications screen.

The backend notification sender must omit
`message.android.notification.event_time` for ordinary PeopleHRSync updates. In
Firebase Admin SDK for .NET, do not assign `AndroidNotification.EventTimestamp`
unless the notification represents a real event time. In particular, do not
serialize `DateTime.MinValue`, `default(DateTime)`, the Unix epoch, or a Unix
seconds value as milliseconds.

Review every shared and event-specific sender used by:

- Team Assignment
- Team Membership Updated
- Reporting Days Updated
- Test Push Notifications

A normal Android payload should retain the existing title, body, channel and
navigation data, while omitting `event_time`:

```json
{
  "message": {
    "token": "<registered native FCM token>",
    "notification": {
      "title": "Team Assignment",
      "body": "You have been assigned to a team."
    },
    "data": {
      "screen": "teams",
      "type": "<existing backend event type>"
    },
    "android": {
      "notification": {
        "channel_id": "hrms_updates"
      }
    }
  }
}
```

`remoteMessage.sentTime` is Firebase transport metadata. It is useful for
diagnostics, but it is not a replacement for `event_time` and should not be
copied into that field. The internal diagnostics panel now reports whether
`event_time` was present, whether it was plausible, and whether delivery was a
remote FCM notification or an app-created local notification. It does not log
the payload, employee data, JWT, device token or installation ID.

Validate this fix with newly sent notifications. Notifications already in the
Android shade keep their original metadata.

## Permission and registration validation

Expo can report Android notification permission as `denied` even though the OS
still allows a runtime request. Automatic onboarding therefore checks the
normalized `granted` value together with `canAskAgain`; it does not require the
status string to be `undetermined`.

The legacy SecureStore key is retained for migration. Because its `presented`
value does not prove whether the employee declined or merely saw older
onboarding, it does not silently suppress the `peoplehrsync-fcm-launch-v1`
rollout. An employee with that ambiguous legacy state receives one non-blocking
setup card. Choosing Enable Notifications invokes the real Android request;
choosing Not now records `dismissed` for this rollout. A native grant or denial
records `granted` or `denied`. Permission-request failures do not persist a
rollout decision. The existing Notifications screen remains the long-term
user-initiated retry and Settings entry point.

Use the `fcm-test` EAS profile on a physical Android device. Test fresh install,
allow, deny, recovery through Android Settings, permission revocation, logout,
account switching, foreground, background, closed-app delivery and grouped
notifications. Confirm the backend receives the authenticated registration at
`POST /api/user-notifications/devices` after permission becomes granted.

The Expo Notifications Android library contributes
`android.permission.POST_NOTIFICATIONS` during manifest merging. Verify it in
the merged manifest for the test build. The existing `hrms_updates` channel is
created before a permission request or native token lookup.

When permission is revoked, the app stops permission-dependent registration and
invalidates its session registration cache. It does not call the manual-logout
DELETE flow because that flow deliberately blocks further registration for the
current session. Android suppresses delivery while permission is disabled. If
the backend must stop FCM send attempts too, add a reversible suspend/disable
operation rather than reusing the terminal logout operation.

Keep production disabled until the physical-device checks pass. The production
profile can then change only `EXPO_PUBLIC_ENABLE_FCM_PUSH` from `false` to
`true`; keep `EXPO_PUBLIC_FCM_REGISTRATION_DIAGNOSTICS` set to `false`.
