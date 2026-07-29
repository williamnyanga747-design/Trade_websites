<?php
/**
 * TradeCore ERP & POS - PHP + MySQL Backend Handler
 * Upload this file to your cPanel hosting under public_html/api/php_sync.php or api.php
 */

// Enable CORS for frontend web application
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-API-Key");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database Credentials - EDIT THESE FOR YOUR CPANEL MYSQL DATABASE
$db_host = "localhost";
$db_name = "tanzatrade_tradecore_erp";
$db_user = "tanzatrade_tanzatrade";
$db_pass = "123456789@Tanzatrade";

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    // If DB connection fails, return fallback JSON status
    echo json_encode([
        "success" => false,
        "error" => "Database connection failed: " . $e->getMessage()
    ]);
    exit();
}

// Ensure database table exists
$pdo->exec("
    CREATE TABLE IF NOT EXISTS tradecore_system_state (
        id INT PRIMARY KEY AUTO_INCREMENT,
        doc_key VARCHAR(100) UNIQUE NOT NULL,
        json_data LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");

$action = isset($_GET['action']) ? $_GET['action'] : '';
$raw_input = file_get_contents("php://input");
$input = json_decode($raw_input, true);

if (!$action && isset($input['action'])) {
    $action = $input['action'];
}

// 1. GET SYSTEM STATE
if ($_SERVER['REQUEST_METHOD'] === 'GET' || $action === 'get_state') {
    $stmt = $pdo->prepare("SELECT json_data, updated_at FROM tradecore_system_state WHERE doc_key = 'main_state' LIMIT 1");
    $stmt->execute();
    $row = $stmt->fetch();

    if ($row && $row['json_data']) {
        $decoded = json_decode($row['json_data'], true);
        echo json_encode([
            "success" => true,
            "status" => "ok",
            "data" => $decoded,
            "lastUpdated" => $row['updated_at']
        ]);
    } else {
        echo json_encode([
            "success" => true,
            "status" => "ok",
            "data" => null,
            "message" => "No state found in PHP database yet."
        ]);
    }
    exit();
}

// 2. SAVE SYSTEM STATE
if ($_SERVER['REQUEST_METHOD'] === 'POST' || $action === 'save_state') {
    $payloadData = null;
    if (isset($input['data'])) {
        $payloadData = $input['data'];
    } else if ($input) {
        $payloadData = $input;
    }

    if ($payloadData) {
        $jsonString = json_encode($payloadData, JSON_UNESCAPED_UNICODE);
        
        $stmt = $pdo->prepare("
            INSERT INTO tradecore_system_state (doc_key, json_data, updated_at)
            VALUES ('main_state', :json_data, NOW())
            ON DUPLICATE KEY UPDATE json_data = VALUES(json_data), updated_at = NOW();
        ");
        $stmt->execute(['json_data' => $jsonString]);

        echo json_encode([
            "success" => true,
            "status" => "ok",
            "message" => "State saved successfully to MySQL via PHP",
            "updatedAt" => date("Y-m-d H:i:s")
        ]);
    } else {
        echo json_encode([
            "success" => false,
            "error" => "Empty payload provided"
        ]);
    }
    exit();
}

// 3. STREAM REALTIME UPDATES (Server-Sent Events)
if ($action === 'stream_updates') {
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');

    $lastSeen = '';
    for ($i = 0; $i < 10; $i++) {
        $stmt = $pdo->prepare("SELECT json_data, updated_at FROM tradecore_system_state WHERE doc_key = 'main_state' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();

        if ($row && $row['updated_at'] !== $lastSeen) {
            $lastSeen = $row['updated_at'];
            $data = json_decode($row['json_data'], true);
            echo "data: " . json_encode(["data" => $data, "updatedAt" => $lastSeen]) . "\n\n";
            ob_flush();
            flush();
        }
        sleep(2);
    }
    exit();
}

echo json_encode(["success" => true, "status" => "online", "message" => "TradeCore PHP REST API service ready."]);
