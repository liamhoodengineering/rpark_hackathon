import { useEffect, useState } from 'react';
import { request } from '../api/client.js';
import { votesApi } from '../api/votes.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useAuthModal } from '../contexts/AuthModalContext.js';
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

const TITLE_MAX_LENGTH = 25;

function truncateTitle(name: string): string {
  return name.length > TITLE_MAX_LENGTH
    ? `${name.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`
    : name;
}

export function VoteCard({
  pin,
  userPosition,
  onVoteCast,
  onPinRemoved,
}: VoteCardProps) {
  const { user } = useAuth();
  const { openAuth } = useAuthModal();
  const [tally, setTally] = useState<VoteTally | null>(null);
  const [voting, setVoting] = useState(false);
  const [myVote, setMyVote] = useState<VoteType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [voteError, setVoteError] = useState('');

  useEffect(() => {
    votesApi
      .getTally(pin.id)
      .then(setTally)
      .catch(() => null);
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
    haversineMeters(userPosition.lat, userPosition.lng, pin.lat, pin.lng) <=
      pin.radius_m;

  const isOwner = user !== null && user.id === pin.reporter_id;
  const canVote =
    user !== null && userPosition !== null && isNearby && !isOwner;

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
        await votesApi.cast(
          pin.id,
          voteType,
          userPosition.lat,
          userPosition.lng,
        );
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

  const severityColor = { Low: '#22c55e', Medium: '#f97316', High: '#ef4444' }[
    pin.severity
  ];

  return (
    <div className='vote-card'>
      <div className='vote-card-header'>
        <span
          className='severity-badge'
          style={{ backgroundColor: severityColor }}
        >
          {pin.severity}
        </span>
        {pin.name && (
          <h3 className='pin-name' title={pin.name}>
            {truncateTitle(pin.name)}
          </h3>
        )}
        {pin.description && <p className='pin-desc'>{pin.description}</p>}
        {pin.expires_at && (
          <span className='expiry-badge'>
            ⏰ {formatExpiry(pin.expires_at)}
          </span>
        )}
        {!pin.reporter_id && <span className='anon-badge'>Anonymous pin</span>}
      </div>

      {voteError && <p className='error-msg'>{voteError}</p>}

      <div className='vote-actions'>
        <p className='vote-label'>Is this hazard still here?</p>
        <div className='vote-buttons'>
          <button
            className={`btn btn-upvote${myVote === 'up' ? ' btn-vote-active' : ''}`}
            onClick={() => castVote('up')}
            disabled={!canVote || voting}
            aria-pressed={myVote === 'up'}
          >
            👍 Still here · {tally ? tally.up : '…'}
          </button>
          <button
            className={`btn btn-downvote${myVote === 'down' ? ' btn-vote-active' : ''}`}
            onClick={() => castVote('down')}
            disabled={!canVote || voting}
            aria-pressed={myVote === 'down'}
          >
            👎 Gone now · {tally ? tally.down : '…'}
          </button>
        </div>

        {!user ? (
          <p className='vote-prompt'>
            <button
              type='button'
              className='link-button'
              onClick={() => openAuth('login')}
            >
              Sign in
            </button>{' '}
            to vote on hazards.
          </p>
        ) : !userPosition ? (
          <p className='vote-prompt'>Enable location to vote.</p>
        ) : !isNearby ? (
          <p className='vote-prompt'>Get closer to vote on this pin.</p>
        ) : !isOwner ? (
          myVote ? (
            <p className='vote-prompt'>
              You voted “{myVote === 'up' ? 'Still here' : 'Gone now'}.” Tap it
              again to undo.
            </p>
          ) : null
        ) : null}

        {isOwner && (
          <button
            className='btn btn-danger'
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
