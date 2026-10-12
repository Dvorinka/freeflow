# Security

FreeFlow processes voice locally and exposes no network surface beyond
loopback HTTP between the app and its own sidecar. Meeting WAVs are the
only audio ever written to disk, under your app-data dir.

To report a vulnerability: use GitHub's private vulnerability reporting on
[Dvorinka/freeflow](https://github.com/Dvorinka/freeflow/security/advisories/new),
or mail `info@tdvorak.dev`. Please allow reasonable time to fix before
disclosing publicly.
