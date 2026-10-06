# ASR QA Bench — frontend

Static browser UI for the faster-whisper QA API. It supports audio file upload and microphone recording, Vietnamese/English/auto language selection, transcript export, and client/server latency metrics. No audio is stored by this frontend.

## Deploy to Vercel

1. Import `pot030321/fe_test_asr` as a new Vercel project.
2. Select **Other** as the framework preset. There is no build command or package install; serve the repository root as the output directory.
3. Deploy. Enter the HTTPS backend origin and the access token in the page.

The API URL is saved in local storage. The token is kept only in the current browser tab's session storage. Do not put the token in source code or a public Vercel environment variable.

## Backend connection

The browser calls `GET /healthz` and `POST /api/transcribe` directly. The backend must have a public HTTPS origin, or be reachable through a VPN/private network used by the tester. A Vercel page cannot call a private server IP such as `192.168.x.x` from the public internet. The backend CORS allowlist must include the deployed Vercel origin. See [be_test_asr](https://github.com/pot030321/be_test_asr) for the server setup.

Microphone access requires a secure context (HTTPS, or localhost). Recording is sent after the user presses Stop; this tests real microphone audio but does not perform partial streaming transcription.
