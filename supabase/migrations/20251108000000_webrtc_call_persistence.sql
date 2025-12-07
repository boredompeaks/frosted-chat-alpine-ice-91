-- WebRTC Call Persistence Schema
-- Adds call tracking to the existing chat system

-- Enable RLS on all new tables
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ============================================
-- EXTEND CHATS TABLE FOR CALLS
-- ============================================

-- Add call-related columns to chats table
ALTER TABLE chats
ADD COLUMN IF NOT EXISTS active_call_id UUID,
ADD COLUMN IF NOT EXISTS call_type TEXT CHECK (call_type IN ('audio', 'video')),
ADD COLUMN IF NOT EXISTS call_status TEXT CHECK (call_status IN ('idle', 'active', 'ended')) DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS call_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_initiator UUID REFERENCES auth.users(id);

-- Index for fast call lookups
CREATE INDEX IF NOT EXISTS idx_chats_active_call ON chats(active_call_id) WHERE call_status = 'active';
CREATE INDEX IF NOT EXISTS idx_chats_call_status ON chats(call_status);

-- ============================================
-- EXTEND CHAT_PARTICIPANTS TABLE FOR CALLS
-- ============================================

-- Add call-specific participant state
ALTER TABLE chat_participants
ADD COLUMN IF NOT EXISTS call_status TEXT CHECK (call_status IN ('idle', 'calling', 'ringing', 'connected', 'declined')) DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS joined_call_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS left_call_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_role TEXT CHECK (call_role IN ('initiator', 'receiver', 'participant')) DEFAULT 'participant',
ADD COLUMN IF NOT EXISTS media_enabled JSONB DEFAULT '{"audio": false, "video": false, "screen": false}'::jsonb;

-- Index for participant call status
CREATE INDEX IF NOT EXISTS idx_chat_participants_call_status ON chat_participants(call_status, user_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_call_role ON chat_participants(call_role, user_id);

-- ============================================
-- CALL EVENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS call_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'call_initiated',
        'call_ringing',
        'call_answered',
        'call_declined',
        'call_connected',
        'call_disconnected',
        'call_ended',
        'participant_joined',
        'participant_left',
        'media_toggled',
        'error_occurred'
    )),
    user_id UUID REFERENCES auth.users(id),
    event_data JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for call events
CREATE INDEX idx_call_events_call_id ON call_events(call_id);
CREATE INDEX idx_call_events_chat_id ON call_events(chat_id);
CREATE INDEX idx_call_events_timestamp ON call_events(timestamp DESC);
CREATE INDEX idx_call_events_type ON call_events(event_type);

-- ============================================
-- CALL METRICS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS call_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,

    -- Connection Quality Metrics
    connection_quality TEXT CHECK (connection_quality IN ('excellent', 'good', 'fair', 'poor')),
    latency_ms INTEGER,
    jitter_ms DECIMAL(10,2),
    packet_loss_percent DECIMAL(5,2),

    -- Media Statistics
    video_width INTEGER,
    video_height INTEGER,
    video_frame_rate DECIMAL(5,2),
    audio_bitrate_kbps INTEGER,
    video_bitrate_kbps INTEGER,

    -- Bandwidth and Network
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    packets_sent INTEGER DEFAULT 0,
    packets_received INTEGER DEFAULT 0,
    packets_lost INTEGER DEFAULT 0,

    -- WebRTC Stats
    ice_connection_state TEXT,
    peer_connection_state TEXT,
    signaling_state TEXT,

    -- CPU and Performance
    cpu_usage_percent DECIMAL(5,2),
    memory_usage_mb INTEGER,

    -- TURN Server Info
    turn_server_used TEXT,
    turn_latency_ms INTEGER,

    -- Timestamps
    measured_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for call metrics
CREATE INDEX idx_call_metrics_call_id ON call_metrics(call_id);
CREATE INDEX idx_call_metrics_user_id ON call_metrics(user_id);
CREATE INDEX idx_call_metrics_measured_at ON call_metrics(measured_at DESC);
CREATE INDEX idx_call_metrics_quality ON call_metrics(connection_quality);

-- ============================================
-- CALL QUALITY PRESETS
-- ============================================

CREATE TABLE IF NOT EXISTS call_quality_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    video_width INTEGER NOT NULL,
    video_height INTEGER NOT NULL,
    video_frame_rate INTEGER NOT NULL,
    video_bitrate_kbps INTEGER,
    audio_bitrate_kbps INTEGER,
    min_bitrate_kbps INTEGER,
    max_bitrate_kbps INTEGER,
    resolution_preset TEXT CHECK (resolution_preset IN ('low', 'medium', 'high', 'hd')),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default quality presets
INSERT INTO call_quality_presets (name, description, video_width, video_height, video_frame_rate, video_bitrate_kbps, audio_bitrate_kbps, min_bitrate_kbps, max_bitrate_kbps, resolution_preset, is_default)
VALUES
    ('Low Quality', 'For slow connections - 360p at 15fps', 640, 360, 15, 150, 32, 100, 200, 'low', false),
    ('Medium Quality', 'Balanced quality and bandwidth - 480p at 24fps', 854, 480, 24, 300, 48, 200, 400, 'medium', true),
    ('High Quality', 'High quality for fast connections - 720p at 30fps', 1280, 720, 30, 800, 64, 500, 1000, 'high', false),
    ('HD Quality', 'Premium quality - 1080p at 30fps', 1920, 1080, 30, 1500, 96, 1000, 2000, 'hd', false),
    ('Auto Quality', 'Automatically adjust based on connection', 1920, 1080, 30, 1500, 96, 100, 2000, 'hd', false)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- TURN SERVER PERFORMANCE TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS turn_server_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_url TEXT NOT NULL,
    server_region TEXT,
    latency_ms INTEGER,
    success_rate DECIMAL(5,2),
    active_connections INTEGER DEFAULT 0,
    total_connections INTEGER DEFAULT 0,
    measured_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_turn_server_metrics_server_url ON turn_server_metrics(server_url);
CREATE INDEX idx_turn_server_metrics_measured_at ON turn_server_metrics(measured_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE turn_server_metrics ENABLE ROW LEVEL SECURITY;
-- call_quality_presets is public read-only

-- RLS Policies for chats
CREATE POLICY "Users can view chats they are participants in"
    ON chats FOR SELECT
    USING (
        auth.uid() IN (
            SELECT user_id FROM chat_participants WHERE chat_id = chats.id
        )
    );

CREATE POLICY "Users can update chats they are participants in"
    ON chats FOR UPDATE
    USING (
        auth.uid() IN (
            SELECT user_id FROM chat_participants WHERE chat_id = chats.id
        )
    );

-- RLS Policies for chat_participants
CREATE POLICY "Users can view participant info for their chats"
    ON chat_participants FOR SELECT
    USING (
        auth.uid() IN (
            SELECT cp.user_id FROM chat_participants cp WHERE cp.chat_id = chat_participants.chat_id
        )
    );

CREATE POLICY "Users can update their own participant data"
    ON chat_participants FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for call_events
CREATE POLICY "Users can view call events for their chats"
    ON call_events FOR SELECT
    USING (
        auth.uid() IN (
            SELECT user_id FROM chat_participants WHERE chat_id = call_events.chat_id
        )
    );

CREATE POLICY "Users can insert call events for their chats"
    ON call_events FOR INSERT
    WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM chat_participants WHERE chat_id = call_events.chat_id
        )
    );

-- RLS Policies for call_metrics
CREATE POLICY "Users can view their own call metrics"
    ON call_metrics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own call metrics"
    ON call_metrics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policies for turn_server_metrics (admin only)
CREATE POLICY "Only service role can manage turn server metrics"
    ON turn_server_metrics FOR ALL
    USING (auth.role() = 'service_role');

-- RLS Policies for call_quality_presets (public read)
CREATE POLICY "Anyone can read quality presets"
    ON call_quality_presets FOR SELECT
    USING (true);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to automatically update chat_participants when call status changes
CREATE OR REPLACE FUNCTION update_participant_call_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.call_status = 'connected' AND OLD.call_status != 'connected' THEN
        NEW.joined_call_at = NOW();
    ELSIF NEW.call_status IN ('declined', 'ended', 'idle') AND OLD.call_status = 'connected' THEN
        NEW.left_call_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_participant_call_status
    BEFORE UPDATE ON chat_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_participant_call_status();

-- Function to automatically update chat when call starts/ends
CREATE OR REPLACE FUNCTION update_chat_call_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.call_status = 'active' AND (OLD.call_status IS DISTINCT FROM 'active') THEN
        NEW.call_started_at = NOW();
    ELSIF NEW.call_status = 'ended' AND OLD.call_status = 'active' THEN
        NEW.call_ended_at = NOW();
        NEW.active_call_id = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_call_status
    BEFORE UPDATE ON chats
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_call_status();

-- Function to log call events automatically
CREATE OR REPLACE FUNCTION log_call_event(
    p_call_id UUID,
    p_chat_id UUID,
    p_event_type TEXT,
    p_user_id UUID,
    p_event_data JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO call_events (call_id, chat_id, event_type, user_id, event_data)
    VALUES (p_call_id, p_chat_id, p_event_type, p_user_id, p_event_data)
    RETURNING id INTO event_id;

    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active call for a chat
CREATE OR REPLACE FUNCTION get_active_call(p_chat_id UUID)
RETURNS TABLE (
    call_id UUID,
    call_type TEXT,
    call_status TEXT,
    initiator UUID,
    started_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.active_call_id,
        c.call_type,
        c.call_status,
        c.call_initiator,
        c.call_started_at
    FROM chats c
    WHERE c.id = p_chat_id
    AND c.call_status = 'active'
    AND c.active_call_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get call participants with their status
CREATE OR REPLACE FUNCTION get_call_participants(p_call_id UUID)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    call_status TEXT,
    call_role TEXT,
    media_enabled JSONB,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cp.user_id,
        p.username,
        cp.call_status,
        cp.call_role,
        cp.media_enabled,
        cp.joined_call_at,
        cp.left_call_at
    FROM chat_participants cp
    JOIN profiles p ON p.id = cp.user_id
    WHERE cp.chat_id = (
        SELECT chat_id FROM call_events WHERE call_id = p_call_id LIMIT 1
    )
    AND cp.call_status IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VIEWS FOR MONITORING
-- ============================================

-- View for active calls with participant count
CREATE OR REPLACE VIEW active_calls_view AS
SELECT
    c.id AS chat_id,
    c.active_call_id,
    c.call_type,
    c.call_status,
    c.call_started_at,
    c.call_initiator,
    cp.participant_count,
    cp.connected_count
FROM chats c
LEFT JOIN (
    SELECT
        chat_id,
        COUNT(*) AS participant_count,
        COUNT(CASE WHEN call_status = 'connected' THEN 1 END) AS connected_count
    FROM chat_participants
    WHERE call_status IS NOT NULL
    GROUP BY chat_id
) cp ON c.id = cp.chat_id
WHERE c.call_status = 'active';

-- Grant view permissions
GRANT SELECT ON active_calls_view TO authenticated;

-- ============================================
-- COMMENTS AND DOCUMENTATION
-- ============================================

COMMENT ON TABLE call_events IS 'Tracks all events during a call lifecycle';
COMMENT ON TABLE call_metrics IS 'Stores performance and quality metrics for each call';
COMMENT ON TABLE call_quality_presets IS 'Predefined quality settings for calls';
COMMENT ON TABLE turn_server_metrics IS 'Tracks TURN server performance and selection';
COMMENT ON VIEW active_calls_view IS 'Real-time view of all active calls with participant counts';
