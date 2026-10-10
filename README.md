# Home Depot Receipt Downloader

A locally installed Chrome extension that downloads individual order-detail pages from [The Home Depot](https://www.homedepot.com/) Purchase History as HTML files. It uses your existing signed-in Chrome session, scans purchases across paginated results, and captures the rendered order details rather than the incomplete HTML returned by a basic network request.

> **Unofficial project:** This extension is not affiliated with, sponsored by, or endorsed by The Home Depot.

## Features

- **Multi-page scanning:** Collects order-detail links across the pages of the selected Purchase History date range.
- **Selective downloads:** Optional case-insensitive, *contains* filters for **PO/Job**, **Project**, **Purchaser**, **Origin**, and **Payment**. Multiple enabled filters are combined with AND.
- **Flexible destination:** Choose a subfolder within Chrome's configured Downloads directory.
- **Optional organization:** Separate orders into subfolders by PO/Job, Project, Purchaser, Origin, or Payment.
- **Consistent filenames:** `YYYY-MM-DD_homedepot_order_NUMBER.html`.
- **Progress reporting:** View the current order, completed downloads, failures, and results in Chrome's side panel.
- **Safe trial run:** Test the first two matching orders before downloading the entire selection.
- **Remembered settings:** Filtering, folder, grouping, and panel display preferences are saved locally.

## Requirements

- Google Chrome **116 or later** (Manifest V3 and Side Panel API).
- A Home Depot account with access to **Purchase History**.
- Permission to install an unpacked extension in Chrome.

## Install

1. Download or clone this repository to a permanent location.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and choose the repository directory containing `manifest.json`.
5. Optionally pin the extension to your toolbar. Click its icon to open the side panel.

After modifying the extension's source, click **Reload** on its card at `chrome://extensions`.

## Use

1. Sign in to [Home Depot](https://www.homedepot.com/) in your regular Chrome browser and open **Purchase History**.
2. Select the desired date range and any filters offered by Home Depot.
3. In Home Depot's **Table Settings**, show the columns you intend to use for extension filtering or subfolder grouping.
4. Open the extension's side panel and click **Scan orders**. The extension scans the displayed date range across its paginated results and reports the number discovered.
5. Optionally configure **Filtering Options** to download only matching orders.
6. Optionally configure **Download Location**, including a Downloads-relative folder and subfolder grouping.
7. Click **Test first 2** or **Download all**.
8. **Keep the side panel open until the batch finishes.** You may switch browser tabs during the download.

The extension uses a separate, reusable receipt tab to load one order at a time. It waits for the order/receipt heading and totals before saving the rendered HTML. Online orders may display `ORDER #`; in-store receipts may display `RECEIPT #`.

### Output

By default, files are saved beneath Chrome's configured Downloads directory:

```text
Downloads/
└── homedepot_receipts/
    ├── 2022-07-30_homedepot_order_00052-19597.html
    └── 2022-10-29_homedepot_order_WB28485582.html
```

With **Separate into subfolders** enabled and **PO/Job** selected, an example layout is:

```text
Downloads/
└── homedepot_receipts/
    ├── 97TH/
    │   └── 2022-11-17_homedepot_order_00060-89601.html
    └── No_PO_Job_Name/
        └── 2022-07-30_homedepot_order_00052-19597.html
```

Subfolder names replace every character other than `A-Z`, `a-z`, `0-9`, `-`, `_`, and `.` with an underscore. Missing or unassigned values use a category-specific fallback folder.

**Destination limitation:** The extension's downloads API saves into subdirectories of Chrome's configured Downloads directory; entering an arbitrary absolute filesystem path is not supported. Existing files with the same output filename are overwritten.

## Filtering behavior

Filters match text **case-insensitively** using substring matching. If multiple filters are enabled, an order must satisfy **all** of them. The side panel displays how many of the discovered orders match before starting the download.

Filtering and grouping depend on the information Home Depot exposes in its Purchase History table. If a field is not available, enable that column in **Table Settings**, then click **Scan orders** again. The extension reports missing required fields instead of silently downloading an incorrect selection.

## Limitations and troubleshooting

- **Website changes:** The extension relies on Home Depot's current page structure and pagination controls. Changes to the site may require updates.
- **Scan count mismatch:** Compare the discovered count with Home Depot's total (for example, `Viewing 1-20 of 26`). A mismatch indicates the scan may be incomplete. At the time of the October 10, 2026 release, Home Depot was observed displaying 19 rather than 20 purchases on the first paginated page in some cases.
- **Purchase History not found:** Sign in to Home Depot, open its Purchase History page, then click **Scan orders**. The side panel also has an **Instructions** dialog.
- **Receipt timeout:** If an order fails to render within 65 seconds, it is recorded as a failure and processing continues. Confirm that the order opens normally in Home Depot. The extension recognizes both `ORDER #` and `RECEIPT #` headings.
- **Downloaded HTML appears blank when opened:** Files contain the rendered receipt DOM, including item descriptions and totals, but are **not self-contained offline website archives**. Scripts may run differently when opened from disk. Inspect the file in a text editor when checking preserved content.
- **Multiple-download prompt:** Chrome may ask whether the site or extension can download multiple files. Allow downloads if prompted.
- **Closing the side panel stops the batch:** The side panel must remain open for the current implementation.

## Permissions and privacy

The extension requests:

| Permission | Purpose |
| --- | --- |
| `sidePanel` | Display the controls and progress interface. |
| `tabs` | Find the open Purchase History tab and reuse one receipt tab. |
| `scripting` | Read receipt links and rendered order details from Home Depot pages. |
| `downloads` | Write the HTML files to Chrome's Downloads directory. |
| `storage` | Remember your extension preferences locally. |
| Host access to `homedepot.com` | Read Home Depot Purchase History and order-detail pages. |

The extension works in your signed-in browser session. It does not ask for your Home Depot password and does not send your receipts to an external collection service. Downloaded files may contain personal or purchase information; store and share them accordingly.

## Development

This is a small, dependency-free Manifest V3 extension:

```text
manifest.json      Extension metadata and permissions
background.js      Toolbar / side-panel activation
sidepanel.html      Side-panel layout and dialogs
sidepanel.css       Styling
sidepanel.js        Scanning, filtering, rendering checks, and downloading
```

Edit these files directly, reload the unpacked extension at `chrome://extensions`, and test using a small Purchase History date range or **Test first 2**.

## License

This project is licensed under the [MIT License](LICENSE). Copyright © 2026 Mark Schneider.

## Contributing

Contributions are welcome, including bug reports, documentation improvements, and pull requests.

1. Check existing [issues](https://github.com/markaschneider/home-depot-orders-downloader/issues) before opening a new one.
2. For a bug report, describe the steps to reproduce, the expected behavior, and what happened instead. Include your Chrome version and extension version when relevant.
3. To propose a code change, fork the repository, create a descriptive branch, make your changes, and submit a pull request explaining the change and how you tested it.
4. Test changes against Home Depot's Purchase History page, including pagination and multiple order types, when applicable.

**Privacy:** Do not include real receipt HTML, order URLs with encrypted query parameters, customer details, or other personal or account information in issues or pull requests. Redact sensitive information from screenshots and logs.

This is an independent, unofficial project; contributions should not imply affiliation with or endorsement by Home Depot.
