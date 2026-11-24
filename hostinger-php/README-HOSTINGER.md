# VyaparLedger ERP — Hostinger Shared Hosting (PHP + MySQL) Deployment Guide

Target Domain: **https://erp1.ashishinfotechsolution.com**

## Step 1: Create the Subdomain in Hostinger
1. Log into **Hostinger hPanel**.
2. Go to **Domains → Subdomains**.
3. Enter `erp1` under `ashishinfotechsolution.com` and create it (note its document root folder, e.g. `public_html/erp1` or `domains/erp1.ashishinfotechsolution.com/public_html`).
4. Go to **Security → SSL** and verify an SSL certificate is active for `erp1.ashishinfotechsolution.com`.

## Step 2: Create the MySQL Database & Import `schema.sql`
1. In Hostinger hPanel, go to **Databases → Management**.
2. Create a new MySQL database, user, and strong password (save all three values).
3. Open **phpMyAdmin** for the new database, click **Import**, select `schema.sql` from this package, and click **Import / Go** (creates all 18 ERP tables).

## Step 3: Upload Files & Configure MySQL Credentials
1. Open Hostinger **File Manager** inside the document root folder for `erp1.ashishinfotechsolution.com`.
2. Upload the downloaded `vyaparledger-hostinger-php-mysql.zip` and click **Extract** (make sure `.htaccess`, `index.html`, `assets/`, and `api/` sit directly inside the subdomain root folder).
3. Edit `api/config.php` and replace:
   - `DB_NAME` → your Hostinger MySQL database name
   - `DB_USER` → your Hostinger MySQL username
   - `DB_PASS` → your Hostinger MySQL password

## Step 4: Authorize Subdomain for Google Sign-In
1. Open **Firebase Console** (`regal-conquest-r7cvm`) → **Authentication → Settings → Authorized domains**.
2. Click **Add domain** and add `erp1.ashishinfotechsolution.com`.

## Step 5: Verify & Restore Data
1. Visit `https://erp1.ashishinfotechsolution.com/api/health` — it should return `{"ok":true,"service":"vyaparledger-erp-php"}`.
2. Open `https://erp1.ashishinfotechsolution.com` and sign in with Google.
3. (Optional) Export a `.json` snapshot from your preview app's **SQL Backup & Restore** tab and restore it on your Hostinger site.
