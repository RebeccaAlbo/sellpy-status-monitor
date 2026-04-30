# Sellpy Inventory Watcher

A specialized web automation tool built with **Puppeteer** to monitor high-demand e-commerce items on Sellpy. It is specifically designed to watch items that are currently "Reserved" in another user's cart and alert you the second they become available again.

---

## Features

* **Real-time Monitoring:** Polls Sellpy pages every minute to check item status.
* **Smart Detection:** Distinguishes between `AVAILABLE`, `RESERVED`, and `SOLD`.
* **Desktop Notifications:** Immediate system alerts via `node-notifier`.
* **Email Alerts:** Automated emails sent to your inbox when an item is back in stock.
* **Auto-Cart (Experimental):** Automatically launches a browser and adds the item to your cart once available.

---

## Prerequisites

* [Node.js](https://nodejs.org/) (v14 or higher)
* A Google Account (for email notifications)

---

## Installation

1.  **Clone the repository or download the files.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create a `.env` file** in the root directory:
    ```env
    EMAIL_USER=your-email@gmail.com
    EMAIL_PASS=your-app-password
    ```

---

## Email Setup (Google/Gmail)

To allow the scraper to send you alerts, you must use a Google App Password. Standard passwords will not work due to security restrictions.

1.  **Enable 2FA:** Ensure **2-Step Verification** is enabled on your [Google Account](https://myaccount.google.com/).
2.  **Generate App Password:**
    * Go to your [Google Account Security settings](https://myaccount.google.com/security).
    * Search for **"App passwords"** in the top search bar.
    * Name it something recognizable, like `Sellpy Monitor`, and click **Create**.
    * Google will display a **16-character code** (e.g., `abcd efgh ijkl mnop`).
3.  **Update .env:** Copy that 16-character code **without spaces** into the `EMAIL_PASS` field in your `.env` file.

---

## Usage

Run the main script to start the CLI interface:

```bash
node scraper.js
```

## Options

To use the faster mode, run:

```bash
node scraper.js --turbo
```


### Workflow
1.  **Paste URL:** Enter the full Sellpy item link (e.g., `https://www.sellpy.se/item/...`).
2.  **Set Alerts:** Choose whether you want desktop notifications or email alerts.
3.  **Wait:** The script will stay active as long as the item is "Reserved." If it becomes "Available," the script will trigger your alerts and/or attempt to add it to your cart.

---

## Disclaimer

This tool is for personal use only. Frequent polling can result in IP rate-limiting. Use responsibly and in accordance with the website's terms of service.

---

## 📂 Project Structure

```text
sellpy-tool/
├── src/
│   ├── watcher.js    <-- The core engine that handles item status scraping.
│   ├── buyer.js      <-- Handles the automated "Add to Cart" functionality.
│   └── scraper.js    <-- The main controller and CLI logic.
├── .env
├── package.json
└── README.md
