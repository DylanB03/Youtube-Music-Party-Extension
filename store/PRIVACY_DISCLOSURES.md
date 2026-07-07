# Chrome Web Store privacy-form answers

Use these notes when completing the Developer Dashboard. Re-check them against the final build before every submission.

## Data-use certification

- The extension's single purpose is synchronized YouTube Music listening parties.
- Data is used only to provide or improve that user-facing purpose, for security/abuse prevention, and as required by law.
- Data is not sold, used for personalized advertising, used for creditworthiness or lending, or transferred for unrelated purposes.

## Data types handled

- **Personally identifiable information:** user-chosen display name, which may be a nickname and is shared with party participants.
- **Authentication information:** random participant and connection credentials used only to reconnect and secure a temporary party.
- **Website content:** the currently selected YouTube Music video ID, title, artist, queue, and playback details required for synchronization.
- **Web history:** do not select general browsing history. The extension is limited to YouTube Music and does not collect browsing activity outside that host. If the dashboard treats current YouTube Music URLs/video IDs as web history, disclose that narrow category rather than under-reporting.
- **User activity:** party actions, playback/synchronization state, roles, and guest permission settings.

## Required links

- Privacy policy: https://github.com/DylanB03/Youtube-Music-Party-Extension/blob/main/PRIVACY.md
- Homepage: https://github.com/DylanB03/Youtube-Music-Party-Extension
- Support: https://github.com/DylanB03/Youtube-Music-Party-Extension/issues

## Remote code

No. All executable extension code is packaged in the Manifest V3 archive. The backend exchanges data only and does not provide executable extension code.
