/*
  # Fix Rate Limit Function

  1. Changes
    - Improves increment_failed_attempts function to properly return attempt count
    - Adds proper error handling
    - Uses WITH clause for atomic operations
    - Returns attempt count reliably

  2. Benefits
    - More accurate rate limiting
    - Better error messages
    - Atomic operations prevent race conditions
*/

CREATE OR REPLACE FUNCTION increment_failed_attempts(
    p_ip_address TEXT,
    p_identifier TEXT,
    p_last_attempt TIMESTAMP
) RETURNS INTEGER AS $$
DECLARE
    v_current_count INTEGER;
BEGIN
    WITH upsert_result AS (
        INSERT INTO failed_attempts (
            ip_address,
            identifier,
            attempt_count,
            last_attempt_at,
            last_reset
        )
        VALUES (
            p_ip_address,
            p_identifier,
            1,
            p_last_attempt,
            p_last_attempt
        )
        ON CONFLICT (ip_address, identifier) DO UPDATE SET
            attempt_count = CASE
                WHEN failed_attempts.last_reset + INTERVAL '15 minutes' < p_last_attempt THEN 1
                ELSE failed_attempts.attempt_count + 1
            END,
            last_attempt_at = p_last_attempt,
            last_reset = CASE
                WHEN failed_attempts.last_reset + INTERVAL '15 minutes' < p_last_attempt THEN p_last_attempt
                ELSE failed_attempts.last_reset
            END
        RETURNING attempt_count
    )
    SELECT attempt_count INTO v_current_count FROM upsert_result;

    -- Ensure we have a value to return
    IF v_current_count IS NULL THEN
        RAISE EXCEPTION 'Failed to increment attempts: count is null';
    END IF;

    RETURN v_current_count;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to increment attempts: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;