# Privacy Policy

**Gym Log**
Effective 9 September 2026 · Last updated 9 September 2026

## The short version

Gym Log is a workout log that runs on your device. If you never sign in, nothing you enter leaves your phone: there is no account, no sync, and no copy of your training anywhere but the device in your hand.

If you do sign in, your training log is copied to your own account so that it survives a lost phone and reaches your other devices. Nothing else happens to it. There are no analytics, no advertising, no trackers, and no third party that receives your training data to use for its own purposes.

## Who is responsible

Gym Log is made and operated by an individual developer. For anything in this policy, including any request about your data, write to **gaurvedant479@gmail.com**.

## Two ways to use Gym Log

**Without an account.** Everything you enter is stored in a database inside the app on your device (IndexedDB). The app is built to work with no signal at all, so it never waits on the network to show you anything. In this mode Gym Log makes no request that carries your training data anywhere.

**With an account.** Signing in turns on sync. Your log is copied to a set of rows that belongs to your account, and that copy is reconciled with your device when you sign in, when the network returns, and when you bring the app to the foreground. Your device remains the source of truth for reading; the server is a backup and a bridge between your own devices.

Signing in is optional and reversible. Signing out leaves your log on the device and stops the syncing.

## What is collected

### Account information — only if you create an account

- Your **email address**, if you sign up with an email and password.
- Your **name and email address as Google reports them**, if you sign in with Google.
- Your **password**, if you set one. It is stored by our authentication provider as a cryptographic hash, never in readable form, and is never visible to the developer.
- **Authentication tokens**, kept on your device so that you are not asked to sign in every time the app is launched.

### Training data — copied to your account only while you are signed in

- The **exercises** in your library, including any you add yourself.
- Your **routines and splits** — the training days you have built and the programme they belong to.
- Your **workout sessions**: for each set, the exercise, the number of reps, the weight, the RPE if you entered one, and whether the set was logged or skipped; plus any note you attach to an exercise, the date, and the start and end time of the session.
- Your **bodyweight entries** and the date of each one.

### Information that stays on the device and is never uploaded

Even with an account signed in, the following never leave your device:

- your **weight unit** (kg or lb);
- the **sex** setting, which is used only to choose which strength standards a lift is compared against;
- interface state such as which lift the Progress screen opens on, and which day of your split is marked as next.

### Technical information

When your device contacts the sync server, ordinary internet request information reaches our hosting provider: your IP address, the time of the request, and your device's user agent string. This is how any network request works rather than a decision to collect information about you. It is not used to build a profile of you and it is not combined with your training data.

## Health-related information

Your bodyweight and the sex setting are health-related, and are treated as sensitive.

The sex setting never leaves your device. Bodyweight is synced with the rest of your log only if you are signed in. Both are used solely to produce the figures the app shows you — estimated one-rep maxes, strength standards and tiers — and for nothing else. They are never used for advertising, never sold, and never shared.

Where the law requires a legal basis for handling information of this kind (for example the GDPR in the EEA, or the UK GDPR), that basis is **your explicit consent**, given by entering the information and, where sync is involved, by choosing to create an account. You can withdraw it at any time by deleting the entries, signing out, or deleting your account.

## What Gym Log never does

- **No analytics or telemetry of any kind.** The app contains no analytics SDK and makes no request to any analytics or crash-reporting service.
- **No advertising**, no advertising identifiers, no ad networks.
- **No selling of personal information**, and no "sharing" of it in the sense the California Consumer Privacy Act gives that word. There is no cross-context behavioural advertising.
- **No profiling** and no automated decision-making producing legal or similarly significant effects.
- **No marketing email.** The only email you may receive is one you asked for, such as a password reset.
- **No use of your training data to train machine-learning models.**

## Who else is involved

| Who | Why | What they receive |
| --- | --- | --- |
| **Supabase** | Hosts the authentication service and the sync database | Your account record and your synced training data, processed on our instructions |
| **Google** | Only if you choose "Sign in with Google" | Google tells us your name and email address; your use of your Google account is governed by Google's own privacy policy |
| **Apple App Store, Google Play** | Distribution of the app | Install and crash information they collect under their own policies, which we do not control |

Supabase acts as a processor: it holds the data so the app can work, and does not use it for its own purposes. Every row in the database is guarded by row-level security keyed to your user id, so one account cannot read another account's rows, and the public key shipped inside the app reads nothing at all on its own.

Synced data is stored in the region selected for the project: **[SUPABASE PROJECT REGION — fill in]**.

Beyond the parties above, your data is disclosed only where the law compels it, and then only to the extent compelled.

## How long it is kept

**On your device**, your log is kept until you delete the app, clear its data, or restore a backup over it. There is no expiry and nothing is deleted on a schedule.

**In your account**, your data is kept until you delete your account. When you delete a record, it syncs as a *tombstone* — a marker recording that the record with that id was removed, and when — so that a deletion made on one device is not undone by another device that has not seen it yet. A tombstone holds the identifier and the time, not the contents of what was deleted.

## Your rights

Depending on where you live, you may have the right to access your data, to correct it, to delete it, to receive a portable copy of it, to object to or restrict its handling, to withdraw consent, and to complain to a data protection authority. This includes rights under the EU and UK GDPR, the California Consumer Privacy Act as amended, and India's Digital Personal Data Protection Act.

Most of these do not require asking anyone, because they are built into the app:

- **Access and portability** — Settings → Your data → *Export backup* writes a JSON file containing everything the app holds on this device: exercises, routines, splits, sessions, bodyweight and settings. It is a plain, readable file you can keep or move to another device.
- **Correction** — any entry can be edited or deleted in the app at any time.
- **Deletion, on the device** — Settings → Your data → *Erase all data*, or delete the app.
- **Withdrawing consent to sync** — sign out. Your log stays on the device and stops being copied anywhere.

## Deleting your account

In the app: **Settings → Your data → Delete account**. It is immediate and it is complete. Your account is deleted, every row of training data belonging to it is deleted with it, and the copy on the device you are holding is erased at the same time. Nothing is retained, there is no waiting period, and signing up again later starts from nothing rather than recovering anything.

Without the app installed: email **gaurvedant479@gmail.com** from the address on the account and say that you want it deleted. The same deletion is carried out by hand within 30 days, and you are told when it is done. Any copy still sitting on a device you own goes when you delete the app from it.

There is no charge for any of this, and you will not be treated differently for asking. If you are asked to confirm who you are before an account is deleted by email, that is only so that nobody else can delete yours.

## Children

Gym Log is not directed at children. Do not create an account if you are under 13, or under 16 where you live if your country sets that age for consent to data handling. If you believe a child has created an account, write to the address above and it will be removed.

## Security

- All network traffic uses TLS.
- Every database row is protected by row-level security tied to your user id.
- Passwords are stored only as hashes, by the authentication provider.
- The key shipped inside the app is a public one and can read nothing without a valid session.
- Your device keeps its own copy, so losing the network or the account never costs you the log in front of you.

No system is perfectly secure, and this is a small independent app rather than a company with a security team. One thing worth knowing: **a backup file you export is plain, unencrypted JSON.** Anyone who opens it can read your training history. Store it the way you would any other personal file.

## Changes to this policy

If this policy changes, the date at the top changes with it. If a change materially affects how your data is handled, you will be told inside the app before it takes effect, and where the law requires consent for the change, you will be asked for it.

## Contact

**gaurvedant479@gmail.com**

If you are in the EEA or the UK and believe your data has been mishandled, you may also complain to your national data protection authority.
