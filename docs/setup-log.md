# Nextcloud Guest Lifecycle Project — Local Setup & API Feasibility Log

**Purpose:** Before committing to the Guest Lifecycle Manager project, verify what Nextcloud actually exposes via API for guest accounts — specifically expiration, ownership, and activity/last-login data — since these determine whether the proposed feature set is buildable.

**Environment:** MacBook Pro (M5 Pro, 24GB), macOS Tahoe, local Docker setup — no cost, no external hosting.

---

## 1. Install Docker Desktop

1. Downloaded Docker Desktop for Apple Silicon from docker.com/products/docker-desktop
2. Installed via .dmg, launched from Applications, granted system permissions
3. Verified install:
   ```
   docker --version
   docker run hello-world
   ```

## 2. Run Nextcloud locally

```
docker run -d -p 8080:80 --name nextcloud nextcloud
```
- Pulled the `nextcloud:latest` image (~25 layers) and started the container
- Nextcloud accessible at `http://localhost:8080`

**Note:** this basic run command has no separate database — Nextcloud uses SQLite inside the container's own filesystem. Fine for this feasibility test; not durable if the container is removed. A docker-compose setup with a separate DB container would be needed for anything longer-term.

## 3. Initial Nextcloud setup (via browser)

- Went to `localhost:8080`, landed on "Create administration account"
- Admin account name/password: arbitrary local credentials (e.g. `admin` / test password) — not real credentials, purely local, nothing verified externally
- Database: left as **SQLite** (the "performance warning" it shows doesn't apply — no real sync clients or production load here)
- Clicked **Install**
- On the "Recommended apps" screen (Calendar, Contacts, Mail, Office, Notes, Talk) — clicked **Skip**, none of these relevant to the project

## 4. Enable the Guests app

- The top search bar (magnifying glass) only searches files/content, **not** the App Store — searching "guest" there returned "No matching results" and caused confusion
- Correct path: profile icon (top right) → **Apps** → search "guests" → install/enable
- Confirmed installed: version 4.10.0, AGPL-licensed, published by Nextcloud, category "Security"
- Read the app's own README (via GitHub: `nextcloud/guests`), which clarified:
  - A guest is a genuine **user account** — not a special type of share
  - Created by inviting someone via email through the normal Share dialog ("Invite guest")
  - Guests only see what's shared with them, restricted app allowlist
  - `occ guests:add` / `occ guests:list` commands exist for CLI management
  - No expiration, owner, or activity field is mentioned anywhere in this README

## 5. Configure Guests admin settings

- Settings → Administration → **Guests** (`localhost:8080/settings/admin/guests`)
- Confirmed toggles: "Use a hash of the email as user ID for improved privacy" (ON by default) — this is why the guest's User ID is a long hash, not the literal email
- Left default app allowlist and 1GB default quota as-is

## 6. Create a test guest account

1. Files app → hover a file → Share
2. Typed a test email (`guest1@test.com`) in the share search field
3. Selected **"Invite guest1@test.com"**
4. Since no mail server is configured locally, the invite email itself doesn't send, but the guest account is created regardless
5. Confirmed in Settings → Guests admin page under "Guest accounts":

   | Email | User ID | Name | Invited by | Received shares |
   |---|---|---|---|---|
   | guest1@test.com | `353176fe177422c70f89367a8c829bfbf4f12a1d6ddb9be306b8a0f35cfbcf08` | kick | admin | 0 |

- Got the full (untruncated) User ID via browser DevTools → Elements → inspecting the table cell

## 7. Generate an API app password

- Profile icon → Settings → **Security** → "Devices & sessions" section
- Entered app name `apitest` → clicked **Create new app password**
- Got a one-time-shown credential: `admin` / `<REDACTED — regenerate a new app password>`

## 8. Query the OCS API for the guest user

```
curl -u admin:<APP_PASSWORD> \
  -H "OCS-APIRequest: true" \
  "http://localhost:8080/ocs/v2.php/cloud/users/353176fe177422c70f89367a8c829bfbf4f12a1d6ddb9be306b8a0f35cfbcf08?format=json"
```

**First two attempts failed** (useful to document as troubleshooting):
- Attempt 1: left the literal placeholder `APP_PASSWORD` in the command → `"statuscode":997,"message":"Unauthorised"`
- Attempt 2: left the literal placeholder `FULL_USER_ID_HERE` in the URL → `"statuscode":404,"message":"User does not exist"`

**Successful response** (status 200, OK):
```json
{
  "enabled": true,
  "id": "353176fe177422c70f89367a8c829bfbf4f12a1d6ddb9be306b8a0f35cfbcf08",
  "firstLoginTimestamp": 0,
  "lastLoginTimestamp": 0,
  "lastLogin": 0,
  "backend": "Guests",
  "quota": {"free": 1073741824, "used": 0, "total": 1073741824},
  "email": "guest1@test.com",
  "displayname": "kick",
  "groups": ["guest_app"],
  ...
}
```

**Key finding:** `lastLogin` / `lastLoginTimestamp` / `firstLoginTimestamp` fields **do exist** on the standard user object returned by the OCS API — this is not a Guests-app-specific extension, it's the same endpoint every Nextcloud user uses. All three were `0` because this guest had never logged in yet (no invite email was sent).

## 9. Confirm `lastLogin` actually updates on real login

To confirm the field isn't just a static placeholder, manually set a password and log in as the guest once:

```
docker exec -it nextcloud php occ user:resetpassword 353176fe177422c70f89367a8c829bfbf4f12a1d6ddb9be306b8a0f35cfbcf08
```
- Prompted for a new password (entered, confirmed)
- Logged in as the guest via an incognito browser window at `localhost:8080` using the User ID and new password
- Logged back out
- Re-ran the same curl command from step 8 to check whether `lastLogin` changed from `0` to a real timestamp

**Result — confirmed.** Re-running the same curl command after logging in as the guest once returned:
```json
{
  "firstLoginTimestamp": 1790597975,
  "lastLoginTimestamp": 1790601864,
  "lastLogin": 1790601864000,
  "quota": {"used": 65647541, ...}
}
```
All three timestamp fields moved from `0` to real values, and `quota.used` reflects the login session too. **This confirms `lastLogin` genuinely updates on real login events** — it is not a static or placeholder field. Inactivity detection based on login recency is confirmed buildable via this API field.

---

## Findings summary (for project proposal / related work)

1. **Guest = real user account**, distinct from shares. A guest can hold multiple shares from different owners, each share having its own expiry — not a single "guest → one expiry" relationship as originally assumed.
2. **No native lifecycle governance fields.** Confirmed via an open, unaddressed Nextcloud GitHub feature request ([nextcloud/server#61398](https://github.com/nextcloud/server/issues/61398)) that owner/host assignment, expiration dates, renewal workflows, and orphan detection are **not implemented in Nextcloud core**. Our system must own this state entirely in its own database — Nextcloud only supplies guest existence, share data, and login timestamps.
3. **Last-login IS available and confirmed working via the OCS API**, on the standard user object — verified by manually logging in as a test guest and observing `lastLogin` change from `0` to a real timestamp. This makes inactivity detection (based on login recency, not file-activity recency) buildable, not just theoretical.
4. **Share-level expiration** (separate from guest accounts) is supported via the OCS Share API, per earlier research — relevant for the "access duration" side of the feature set.

## Revised project framing

"Nextcloud has no native lifecycle governance for guest accounts (see nextcloud/server#61398) — our system provides this as an external governance layer, sourcing guest identity, share data, and login activity from Nextcloud's API while managing lifecycle state (ownership, expiration, review status, history) independently."
