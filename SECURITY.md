# Security Policy

## Secret Handling

This Frontend App Must Not Contain Secrets. Vite Exposes `VITE_*` Variables In
The Browser Bundle, So Those Values Must Be Public And Non-Sensitive.

Use `.env.example` For Documented Public Configuration. Keep `.env`,
`.env.local`, And `.env.*.local` Out Of Git.

## Local Data

Planner Data Is Stored Locally In IndexedDB. The App Does Not Assume Local
Browser Storage Is Protected From Someone With Access To The User's Device Or
Browser Profile.

## Reporting

For Now, Report Security Issues Privately To The Repository Owner Before Opening
Public Issues.
