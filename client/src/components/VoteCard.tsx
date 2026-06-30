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
  const [myVote, setMyVote] = useState<VoteType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [voteError, setVoteError] = useState('');

  useEffect(() => {
    votesApi.getTally(pin.id).then(setTally).catch(() => null);
  }, [pin.id]);

  useEffect(() => {
    if (!user) {
      setMyVote(null);
      return;
    }
    votesApi
      .getMyVote(pin.id)
      .then((res) => setMyVote(res.vote_type))
      .catch(() => null);
  }, [pin.id, user]);

  const isNearby =
    userPosition !== null &&
    haversineMeters(userPosition.lat, userPosition.lng, pin.lat, pin.lng) <= pin.radius_m;

  const isOwner = user !== null && user.id === pin.reporter_id;

  async function castVote(voteType: VoteType) {
    if (!userPosition) return;
    const cancelling = myVote === voteType;
    setVoting(true);
    setVoteError('');
    try {
      if (cancelling) {
        await votesApi.cancel(pin.id);
        setMyVote(null);
      } else {
        await votesApi.cast(pin.id, voteType, userPosition.lat, userPosition.lng);
        setMyVote(voteType);
      }
      const updated = await votesApi.getTally(pin.id);
      setTally(updated);
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
        ) : !isOwner ? (
          <>
            <p className="vote-label">
              {myVote ? 'Tap your choice again to undo it.' : 'Is this hazard still here?'}
            </p>
            <div className="vote-buttons">
              <button
                className={`btn btn-upvote${myVote === 'up' ? ' active' : ''}`}
                onClick={() => castVote('up')}
                disabled={voting}
                aria-pressed={myVote === 'up'}
              >
                👍 Still here
              </button>
              <button
                className={`btn btn-downvote${myVote === 'down' ? ' active' : ''}`}
                onClick={() => castVote('down')}
                disabled={voting}
                aria-pressed={myVote === 'down'}
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
