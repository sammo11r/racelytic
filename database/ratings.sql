CREATE TABLE IF NOT EXISTS app_driver_rating_events (
    model_version VARCHAR(20) NOT NULL,
    series VARCHAR(12) NOT NULL,
    event_id VARCHAR(160) NOT NULL,
    event_date DATETIME NOT NULL,
    year SMALLINT NOT NULL,
    round_number SMALLINT NULL,
    event_sequence SMALLINT NOT NULL DEFAULT 0,
    event_name VARCHAR(200) NOT NULL,
    session_type VARCHAR(20) NOT NULL,
    driver_id VARCHAR(100) NOT NULL,
    driver_name VARCHAR(160) NOT NULL,
    constructor_name VARCHAR(160) NULL,
    position_number SMALLINT NULL,
    position_text VARCHAR(40) NULL,
    rating_before DECIMAL(10,3) NOT NULL,
    rating_after DECIMAL(10,3) NOT NULL,
    rating_change DECIMAL(10,3) NOT NULL,
    expected_score DECIMAL(8,6) NOT NULL,
    actual_score DECIMAL(8,6) NOT NULL,
    expected_position DECIMAL(8,3) NOT NULL,
    field_size SMALLINT NOT NULL,
    completion DECIMAL(7,6) NOT NULL,
    event_weight DECIMAL(7,4) NULL,
    field_strength DECIMAL(10,3) NULL,
    effective_evidence DECIMAL(8,5) NULL,
    uncertainty_before DECIMAL(10,3) NULL,
    uncertainty_after DECIMAL(10,3) NULL,
    evidence_before DECIMAL(10,4) NULL,
    evidence_after DECIMAL(10,4) NULL,
    opponents_beaten SMALLINT NULL,
    higher_rated_beaten SMALLINT NULL,
    key_rival_id VARCHAR(100) NULL,
    key_rival_name VARCHAR(160) NULL,
    key_rival_rating DECIMAL(10,3) NULL,
    key_rival_outcome VARCHAR(12) NULL,
    PRIMARY KEY (model_version, series, event_id, driver_id),
    KEY app_rating_driver_timeline (model_version, series, driver_id, event_date),
    KEY app_rating_event_date (model_version, series, event_date),
    KEY app_rating_year (model_version, series, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS event_weight DECIMAL(7,4) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS event_sequence SMALLINT NOT NULL DEFAULT 0 AFTER round_number;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS field_strength DECIMAL(10,3) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS effective_evidence DECIMAL(8,5) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS uncertainty_before DECIMAL(10,3) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS uncertainty_after DECIMAL(10,3) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS evidence_before DECIMAL(10,4) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS evidence_after DECIMAL(10,4) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS opponents_beaten SMALLINT NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS higher_rated_beaten SMALLINT NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS key_rival_id VARCHAR(100) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS key_rival_name VARCHAR(160) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS key_rival_rating DECIMAL(10,3) NULL;
ALTER TABLE app_driver_rating_events ADD COLUMN IF NOT EXISTS key_rival_outcome VARCHAR(12) NULL;

CREATE TABLE IF NOT EXISTS app_rating_runs (
    model_version VARCHAR(20) NOT NULL,
    series VARCHAR(12) NOT NULL,
    event_count INT NOT NULL,
    rating_row_count INT NOT NULL,
    configuration LONGTEXT NULL,
    calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model_version, series)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_joint_rating_events (
    model_version VARCHAR(24) NOT NULL,
    series VARCHAR(12) NOT NULL,
    event_id VARCHAR(160) NOT NULL,
    event_date DATETIME NOT NULL,
    year SMALLINT NOT NULL,
    round_number SMALLINT NULL,
    event_sequence SMALLINT NOT NULL DEFAULT 0,
    event_name VARCHAR(200) NOT NULL,
    session_type VARCHAR(20) NOT NULL,
    driver_id VARCHAR(100) NOT NULL,
    driver_name VARCHAR(160) NOT NULL,
    constructor_id VARCHAR(100) NULL,
    constructor_name VARCHAR(160) NULL,
    position_number SMALLINT NULL,
    position_text VARCHAR(40) NULL,
    rating_before DECIMAL(10,3) NOT NULL,
    rating_after DECIMAL(10,3) NOT NULL,
    rating_change DECIMAL(10,3) NOT NULL,
    driver_rating_before DECIMAL(10,3) NOT NULL,
    driver_rating_after DECIMAL(10,3) NOT NULL,
    driver_rating_change DECIMAL(10,3) NOT NULL,
    constructor_rating_before DECIMAL(10,3) NOT NULL,
    constructor_rating_after DECIMAL(10,3) NOT NULL,
    constructor_rating_change DECIMAL(10,3) NOT NULL,
    expected_score DECIMAL(8,6) NOT NULL,
    actual_score DECIMAL(8,6) NOT NULL,
    expected_position DECIMAL(8,3) NOT NULL,
    field_size SMALLINT NOT NULL,
    completion DECIMAL(7,6) NOT NULL,
    event_weight DECIMAL(7,4) NULL,
    field_strength DECIMAL(10,3) NULL,
    effective_evidence DECIMAL(8,5) NULL,
    uncertainty_before DECIMAL(10,3) NULL,
    uncertainty_after DECIMAL(10,3) NULL,
    evidence_before DECIMAL(10,4) NULL,
    evidence_after DECIMAL(10,4) NULL,
    driver_uncertainty_before DECIMAL(10,3) NULL,
    driver_uncertainty_after DECIMAL(10,3) NULL,
    driver_evidence_before DECIMAL(10,4) NULL,
    driver_evidence_after DECIMAL(10,4) NULL,
    constructor_uncertainty_before DECIMAL(10,3) NULL,
    constructor_uncertainty_after DECIMAL(10,3) NULL,
    constructor_evidence_before DECIMAL(10,4) NULL,
    constructor_evidence_after DECIMAL(10,4) NULL,
    PRIMARY KEY (model_version, series, event_id, driver_id),
    KEY app_joint_rating_driver_timeline (model_version, series, driver_id, event_date),
    KEY app_joint_rating_event_date (model_version, series, event_date),
    KEY app_joint_rating_year (model_version, series, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE app_rating_runs ADD COLUMN IF NOT EXISTS configuration LONGTEXT NULL;

CREATE TABLE IF NOT EXISTS app_rating_evaluations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    model_version VARCHAR(20) NOT NULL,
    series VARCHAR(12) NOT NULL,
    configuration LONGTEXT NOT NULL,
    metrics LONGTEXT NOT NULL,
    evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY app_rating_evaluation_model (model_version, series, evaluated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
