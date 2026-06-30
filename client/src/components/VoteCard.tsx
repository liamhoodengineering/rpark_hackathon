import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api/client.js';
import { votesApi } from '../api/votes.js';
import { useAuth } from '../contexts/AuthContext.js';
import { haversineMeters } from '../lib/geo.js';
import type { Pin, VoteTally, VoteType } from '../types/domain.js';

interface VoteCardProps {
  pin: Pin;
  userPosition: { lat: number; lng: number } | null;
  onVoteCast?: () => void;
  onPinRemoved?: (pinId: string) => void;
}

function formatExpiry(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  const diffMin = Math.max(0, Math.floor(diffMs / 60_000));
  return diffMin > 0 ? `Expires in ${diffMin}m` : 'Expired';
}

export function VoteCard({ pin, userPosition, onVoteCast, onPinRemoved }: VoteCardProps) {
  const { user } = useAuth();
  const [tally, setTally] = useState<VoteTally | null>(null);
  const [voting, setVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [voteError, setVoteError] = useState('');

  useEffect(() => {
    votesApi.getTally(pin.id).then(setTally).catch(() => null);
  }, [pin.id]);

  const isNearby =
    userPosition !== null &&
    haversineMeters(userPosition.lat, userPosition.lng, pin.lat, pin.lng) <= pin.radius_m;

  const isOwner = user !== null && user.id === pin.reporter_id;

  async function castVote(voteType: VoteType) {
    if (!userPosition) return;
    setVoting(true);
    setVoteError('');
    try {
      await votesApi.cast(pin.id, voteType, userPosition.lat, userPosition.lng);
      const updated = await votesApi.getTally(pin.id);
      setTally(updated);
      setHasVoted(true);
      onVoteCast?.();
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : 'Vote failed');
    } finally {
      setVoting(false);
    }
  }

  async function deletePin() {
    setDeleting(true);
    try {
      await request<void>(`/pins/${pin.id}`, { method: 'DELETE' });
      onPinRemoved?.(pin.id);
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  }

  const severityColor = { Low: '#22c55e', Medium: '#f97316', High: '#ef4444' }[pin.severity];

  return (
    <div className="vote-card">
      <div className="vote-card-header">
        <span className="severity-badge" style={{ backgroundColor: severityColor }}>
          {pin.severity}
        </span>
        {pin.name && <h3 className="pin-name">{pin.name}</h3>}
        {pin.description && <p className="pin-desc">{pin.description}</p>}
        {pin.expires_at && (
          <span className="expiry-badge">⏰ {formatExpiry(pin.expires_at)}</span>
        )}
        {!pin.reporter_id && <span className="anon-badge">Anonymous pin</span>}
      </div>

      <div className="vote-tally">
        {tally ? (
          <>
            <span className="tally-up">👍 {tally.up}</span>
            <span className="tally-sep">/</span>
            <span className="tally-down">👎 {tally.down}</span>
          </>
        ) : (
          <span className="tally-loading">Loading votes…</span>
        )}
      </div>

      {voteError && <p className="error-msg">{voteError}</p>}

      <div className="vote-actions">
        {!user ? (
          <p className="vote-prompt">
            <Link to="/login">Sign in</Link> to vote on hazards.
          </p>
        ) : !userPosition ? (
          <p className="vote-prompt">Enable location to vote.</p>
        ) : !isNearby ? (
          <p className="vote-prompt">Get closer to vote on this pin.</p>
        ) : hasVoted ? (
          <p className="vote-prompt">Thanks for your vote.</p>
        ) : !isOwner ? (
          <>
            <p className="vote-label">Is this hazard still here?</p>
            <div className="vote-buttons">
              <button
                className="btn btn-upvote"
                onClick={() => castVote('up')}
                disabled={voting}
              >
                👍 Still here
              </button>
              <button
                className="btn btn-downvote"
                onClick={() => castVote('down')}
                disabled={voting}
              >
                👎 Gone now
              </button>
            </div>
          </>
        ) : null}

        {isOwner && (
          <button
            className="btn btn-danger"
            onClick={deletePin}
            disabled={deleting}
          >
            {deleting ? 'Removing…' : '🗑 Delete my pin'}
          </button>
        )}
      </div>
    </div>
  );
}
