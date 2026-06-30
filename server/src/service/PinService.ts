import { supabase } from '../lib/supabase.js';
import type {
	Pin,
	PinCreateInput,
	PinLookupInput,
	PinUpdateInput,
} from '../types/index.js';

type PinRpcRow = Pin;

function expectSinglePin(data: PinRpcRow[] | null, error: { message: string } | null): Pin {
	if (error) {
		throw new Error(error.message);
	}
	if (!data || data.length === 0) {
		throw new Error('Pin RPC returned no rows');
	}
	return data[0];
}

export class PinService {
	static async listNearby(input: PinLookupInput): Promise<Pin[]> {
		const { data, error } = await supabase.rpc('list_active_pins', {
			p_lat: input.lat,
			p_lng: input.lng,
			p_radius_m: input.radius,
		});

		if (error) {
			throw new Error(error.message);
		}

		return (data ?? []) as Pin[];
	}

	static async getById(id: string): Promise<Pin | null> {
		const { data, error } = await supabase.rpc('get_pin_by_id', {
			p_pin_id: id,
		});

		if (error) {
			throw new Error(error.message);
		}

		if (!data || data.length === 0) {
			return null;
		}

		return data[0] as Pin;
	}

	static async create(input: PinCreateInput): Promise<Pin> {
		const { data, error } = await supabase.rpc('create_pin', {
			p_reporter_id: input.reporter_id,
			p_lat: input.lat,
			p_lng: input.lng,
			p_name: input.name,
			p_description: input.description,
			p_severity: input.severity,
			p_radius_m: input.radius_m,
			p_expires_at: input.expires_at,
		});

		return expectSinglePin(data as PinRpcRow[] | null, error);
	}

	static async update(id: string, input: PinUpdateInput): Promise<Pin | null> {
		const { data, error } = await supabase.rpc('update_pin', {
			p_pin_id: id,
			p_lat: input.lat,
			p_lng: input.lng,
			p_name: input.name,
			p_description: input.description,
			p_severity: input.severity,
			p_radius_m: input.radius_m,
			p_status: input.status,
		});

		if (error) {
			throw new Error(error.message);
		}

		if (!data || data.length === 0) {
			return null;
		}

		return data[0] as Pin;
	}

	static async delete(id: string): Promise<boolean> {
		const { data, error } = await supabase.rpc('delete_pin', {
			p_pin_id: id,
		});

		if (error) {
			throw new Error(error.message);
		}

		return Boolean(data);
	}
}
