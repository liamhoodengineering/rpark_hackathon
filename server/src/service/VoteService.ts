import { supabase } from '../lib/supabase.js';
import type { PinStatus, VoteType } from '../types/index.js';

interface VoteRow {
  id: string;
  vote_type: VoteType;
}

interface PinVoteCountersRow {
  upvotes: number | null;
  downvotes: number | null;
}

export interface VoteTally {
  up: number;
  down: number;
  total: number;
}

export class VoteService {
  static async getTally(pinId: string): Promise<VoteTally> {
    const { data, error } = await supabase
      .from('votes')
      .select('vote_type')
      .eq('pin_id', pinId);

    if (error) {
      throw new Error(error.message);
    }

    let up = 0;
    let down = 0;

    for (const vote of data ?? []) {
      if (vote.vote_type === 'up') {
        up += 1;
      } else if (vote.vote_type === 'down') {
        down += 1;
      }
    }

    return {
      up,
      down,
      total: up + down,
    };
  }

  static async getUserVote(pinId: string, userId: string): Promise<VoteRow | null> {
    const { data, error } = await supabase
      .from('votes')
      .select('id, vote_type')
      .eq('pin_id', pinId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return (data as VoteRow | null) ?? null;
  }

  static async createVote(input: {
    pinId: string;
    userId: string;
    voteType: VoteType;
  }): Promise<void> {
    const { error } = await supabase.from('votes').insert({
      pin_id: input.pinId,
      user_id: input.userId,
      vote_type: input.voteType,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  static async updateVote(voteId: string, voteType: VoteType): Promise<void> {
    const { error } = await supabase
      .from('votes')
      .update({ vote_type: voteType })
      .eq('id', voteId);

    if (error) {
      throw new Error(error.message);
    }
  }

  static async deleteVote(voteId: string): Promise<void> {
    const { error } = await supabase.from('votes').delete().eq('id', voteId);

    if (error) {
      throw new Error(error.message);
    }
  }

  static async syncPinVoteState(pinId: string, tally: VoteTally): Promise<PinStatus> {
    const nextStatus: PinStatus =
      tally.total >= 5 && tally.down > tally.up ? 'removed' : 'active';

    const { error } = await supabase
      .from('pins')
      .update({
        upvotes: tally.up,
        downvotes: tally.down,
        status: nextStatus,
      })
      .eq('id', pinId);

    if (error) {
      throw new Error(error.message);
    }

    return nextStatus;
  }

  static async syncReporterCredibility(reporterId: string): Promise<void> {
    const { data, error } = await supabase
      .from('pins')
      .select('upvotes, downvotes')
      .eq('reporter_id', reporterId);

    if (error) {
      throw new Error(error.message);
    }

    let upvotesReceived = 0;
    let downvotesReceived = 0;

    for (const pin of (data ?? []) as PinVoteCountersRow[]) {
      upvotesReceived += Number(pin.upvotes ?? 0);
      downvotesReceived += Number(pin.downvotes ?? 0);
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        upvotes_received: upvotesReceived,
        downvotes_received: downvotesReceived,
      })
      .eq('id', reporterId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}
