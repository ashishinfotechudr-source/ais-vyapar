<?php
/**
 * Hostinger MySQL & Session Configuration for VyaparLedger ERP
 * Fill in the MySQL database credentials created in Hostinger hPanel -> Databases -> MySQL Databases.
 */

define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'uXXXXXXXXX_vyaparledger');
define('DB_USER', 'uXXXXXXXXX_erpuser');
define('DB_PASS', 'REPLACE_WITH_YOUR_MYSQL_PASSWORD');

// Replace with a long random hex secret before deploying to Hostinger (used to sign session tokens)
define('AUTH_SECRET', 'REPLACE_WITH_RANDOM_64_CHAR_HEX_SECRET');

// Administrator email notified when a user requests a password reset
define('ADMIN_RESET_EMAIL', 'ashishinfotech.udr@gmail.com');
