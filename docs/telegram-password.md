# Telegram password confirmation

Both Settings → Change password and Login → Forgot password use the existing
GetSupportOSBot and `/api/registration?action=password-*` endpoint. No email is
sent. The user opens a private bot link, approves, then enters the new password
in the original browser tab. No password is sent to Telegram or stored in browser
storage. Reloading the tab requires starting a new request.

Requests last five minutes. Browser and Telegram proofs are independent 256-bit
random values; only SHA-256 digests are persisted. Recovery returns the same
response for existing, unknown and unlinked accounts. Only the current approved
Telegram link can authorize a request. Rate limits are serialized in PostgreSQL:
one request/minute and five/hour per identity, ten/hour per IP (keyed HMAC).
An account without an approved Telegram link must use administrator-reviewed
enrollment; recovery cannot enroll a new Telegram identity.

The change flow additionally requires a verified login session at creation and
claim. Recovery uses the browser proof instead of a login session. Atomic claim
creates a single-use server permit. The backend calls Supabase Auth's admin
`updateUserById` with the password and permit in app_metadata. It never returns
Auth's user/metadata response to the browser.

A deferred constraint trigger on `auth.users.encrypted_password` requires that
permit **in the same transaction**. This is deferred because GoTrue writes the
password before app_metadata. It consumes the permit, removes the metadata,
invalidates other password requests and deletes all sessions. Direct SDK, REST,
email recovery and dashboard password updates without Telegram permission fail
closed. Initial account creation (INSERT) is unaffected. Existing RLS/session
checks make revoked JWTs unusable even before JWT expiry.

This guard deliberately fails closed on future Auth maintenance operations that
rewrite password hashes. Existing accounts use bcrypt cost 10; verify compatibility
before enabling password encryption/rehashing or upgrading Auth behavior. Do not
disable the trigger as a routine recovery workaround. Admin metadata is trusted;
user_metadata is never accepted as a permit.

Validation includes PostgreSQL transaction rollback, approval expiry, wrong sender,
replay, API bypass before and after approval, session revocation, RPC/table grants,
backend credential isolation, and UI gating. A full real-user bot interaction
must still be checked by the account owner; automated tests do not replace that.
