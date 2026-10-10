Home Depot Receipt Downloader — locally installed Chrome extension

INSTALL
1. Unzip this archive somewhere permanent (for example ~/homedepot-extension).
2. In regular Chrome, visit chrome://extensions.
3. Switch on Developer mode and click Load unpacked.
4. Select the homedepot-receipt-downloader folder (containing manifest.json).
5. Pin the extension if desired. Click its toolbar icon to open the side panel.

USE
1. Log into Home Depot using normal Chrome and visit Purchase History.
2. Choose a date range and wait for the first page of purchases to load.
3. Open the extension side panel, then click Refresh order list.
4. The panel navigates through numbered pages (for example 1-20 of 26) and counts their distinct receipt links. Start on page 1 to scan the entire date range.
5. Click Test first 2 or Download all.
6. Keep the side panel OPEN until completion. You may switch browser tabs.
7. Files save in Chrome's default Downloads folder, under homedepot_receipts/.
   Example: ~/Downloads/homedepot_receipts/2022-11-17_homedepot_order_00060-89601.html

IMPORTANT
- The scan clicks numbered pagination controls on the Home Depot page, so the displayed list will end on the last scanned page. Start at page 1. If Home Depot changes its pagination HTML, scanning may stop with an error; never assume a partial result is complete.
- It captures the rendered DOM, not a self-contained offline page. Inspect files in a text editor for product text; opening from disk in Chrome may run page scripts again.
- Closing the side panel STOPS the batch. Keep it open; switching tabs is fine.
- Chrome may prompt about multiple automatic downloads the first time; allow them.
- The extension uses the current authenticated browser session and does not send data to external services.
- Existing files with identical names are overwritten.
- This is a first version for local testing; site markup and security behaviors can change.

Version 0.3: Configurable Downloads-relative folder and optional PO/Job subfolders. Both settings are saved in chrome.storage.local. PO/Job values come from each original receipt URL's POJobName parameter; missing names go to No_PO_Job_Name. Invalid folder characters are replaced with underscores.

Version 0.4: Optional subfolder grouping by PO/Job, Project, Purchaser, Origin or Payment. Set the grouping in the side panel; settings are stored locally. Optional table columns must be enabled in Home Depot Table Settings before scanning for their values.
