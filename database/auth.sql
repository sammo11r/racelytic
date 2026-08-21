CREATE TABLE IF NOT EXISTS app_users (
    id CHAR(36) NOT NULL,
    username VARCHAR(80) NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    terms_version VARCHAR(20) NULL,
    privacy_version VARCHAR(20) NULL,
    legal_accepted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY app_users_username_unique (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username VARCHAR(80) NULL AFTER id;
UPDATE app_users SET username = display_name WHERE username IS NULL OR username = '';
UPDATE app_users account
JOIN (
    SELECT LOWER(username) AS normalized_username, MIN(id) AS retained_id
    FROM app_users
    GROUP BY LOWER(username)
    HAVING COUNT(*) > 1
) duplicates
    ON LOWER(account.username) = duplicates.normalized_username
    AND account.id <> duplicates.retained_id
SET account.username = CONCAT(LEFT(account.username, 67), '-', LEFT(REPLACE(account.id, '-', ''), 8));
ALTER TABLE app_users MODIFY COLUMN username VARCHAR(80) NOT NULL;
ALTER TABLE app_users ADD UNIQUE INDEX IF NOT EXISTS app_users_username_unique (username);
ALTER TABLE app_users DROP INDEX IF EXISTS app_users_email_unique;
ALTER TABLE app_users DROP COLUMN IF EXISTS email;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20) NULL AFTER password_hash;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(20) NULL AFTER terms_version;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS legal_accepted_at DATETIME NULL AFTER privacy_version;

CREATE TABLE IF NOT EXISTS app_sessions (
    id CHAR(64) NOT NULL,
    user_id CHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY app_sessions_user_id_index (user_id),
    KEY app_sessions_expires_at_index (expires_at),
    CONSTRAINT app_sessions_user_id_foreign
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_points_systems (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    race_points JSON NOT NULL,
    sprint_points JSON NOT NULL,
    qualifying_points JSON NULL,
    pole_bonus DECIMAL(8,2) NOT NULL DEFAULT 0,
    fastest_lap_bonus DECIMAL(8,2) NOT NULL DEFAULT 0,
    fastest_lap_max_position SMALLINT NULL,
    count_best_rounds SMALLINT NULL,
    best_first_rounds SMALLINT NULL,
    first_rounds_window SMALLINT NULL,
    best_last_rounds SMALLINT NULL,
    last_rounds_window SMALLINT NULL,
    sprint_counts_toward_round TINYINT(1) NOT NULL DEFAULT 1,
    visibility ENUM('private', 'public') NOT NULL DEFAULT 'private',
    tie_breaker VARCHAR(30) NOT NULL DEFAULT 'countback',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY app_points_systems_user_id_index (user_id),
    KEY app_points_systems_visibility_index (visibility),
    CONSTRAINT app_points_systems_user_id_foreign
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE app_points_systems ADD COLUMN IF NOT EXISTS qualifying_points JSON NULL AFTER sprint_points;
ALTER TABLE app_points_systems ADD COLUMN IF NOT EXISTS best_first_rounds SMALLINT NULL AFTER count_best_rounds;
ALTER TABLE app_points_systems ADD COLUMN IF NOT EXISTS first_rounds_window SMALLINT NULL AFTER best_first_rounds;
ALTER TABLE app_points_systems ADD COLUMN IF NOT EXISTS best_last_rounds SMALLINT NULL AFTER first_rounds_window;
ALTER TABLE app_points_systems ADD COLUMN IF NOT EXISTS last_rounds_window SMALLINT NULL AFTER best_last_rounds;

CREATE TABLE IF NOT EXISTS app_saved_records (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    configuration JSON NOT NULL,
    visibility ENUM('private', 'public') NOT NULL DEFAULT 'private',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY app_saved_records_user_id_index (user_id),
    KEY app_saved_records_visibility_index (visibility),
    CONSTRAINT app_saved_records_user_id_foreign
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE app_saved_records ADD COLUMN IF NOT EXISTS visibility ENUM('private', 'public') NOT NULL DEFAULT 'private' AFTER configuration;

CREATE TABLE IF NOT EXISTS app_custom_championships (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    visibility ENUM('private', 'public') NOT NULL DEFAULT 'private',
    configuration JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY app_custom_championships_user_id_index (user_id),
    KEY app_custom_championships_visibility_index (visibility),
    CONSTRAINT app_custom_championships_user_id_foreign
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
