import { supabase } from '../lib/supabase.js';
import type {
	Pin,
	PinCreateInput,
	PinLookupInput,
	PinUpdateInput,
} from '../types/index.js';

type PinRpcRow = Pin;

const PIN_COLUMNS =
	'id,reporter_id,lng,lat,name,description,severity,radius_m,upvotes,downvotes,status,expires_at,created_at';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const toRadians = (value: number) => (value * Math.PI) / 180;
	const earthRadiusM = 6371000;
	const dLat = toRadians(lat2 - lat1);
	const dLng = toRadians(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRadians(lat1)) *
			Math.cos(toRadians(lat2)) *
			Math.sin(dLng / 2) ** 2;
	return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

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
	static async listAll(): Promise<Pin[]> {
		const { data, error } = await supabase
			.from('pins')
			.select(PIN_COLUMNS)
			.eq('status', 'active')
			.order('created_at', { ascending: false });

		if (error) {
			throw new Error(error.message);
		}

		const now = Date.now();
		return ((data ?? []) as Pin[]).filter(
			(pin) => !pin.expires_at || new Date(pin.expires_at).getTime() > now,
		);
	}

	static async listNearby(input: PinLookupInput): Promise<Pin[]> {
		try {
			const pins = await this.listAll();
			return pins.filter(
				(pin) => haversineMeters(input.lat, input.lng, pin.lat, pin.lng) <= input.radius,
			);
		} catch {
			// Fall through to RPC if direct table access fails.
		}

		const rpc = await supabase.rpc('list_active_pins', {
			p_lat: input.lat,
			p_lng: input.lng,
			p_radius_m: input.radius,
		});

		if (rpc.error) {
			throw new Error(rpc.error.message);
		}

		return (rpc.data ?? []) as Pin[];
	}

	static async getById(id: string): Promise<Pin | null> {
		const { data, error } = await supabase
			.from('pins')
			.select(PIN_COLUMNS)
			.eq('id', id)
			.maybeSingle();

		if (!error) {
			return (data as Pin | null) ?? null;
		}

		const rpc = await supabase.rpc('get_pin_by_id', {
			p_pin_id: id,
		});

		if (rpc.error) {
			throw new Error(rpc.error.message);
		}

		if (!rpc.data || rpc.data.length === 0) {
			return null;
		}

		return rpc.data[0] as Pin;
	}

	static async create(input: PinCreateInput): Promise<Pin> {
		const { data, error } = await supabase
			.from('pins')
			.insert({
				reporter_id: input.reporter_id,
				lat: input.lat,
				lng: input.lng,
				name: input.name,
				description: input.description,
				severity: input.severity,
				radius_m: input.radius_m,
				expires_at: input.expires_at,
			})
			.select(PIN_COLUMNS)
			.single();

		if (!error && data) {
			return data as Pin;
		}

		const rpc = await supabase.rpc('create_pin', {
			p_reporter_id: input.reporter_id,
			p_lat: input.lat,
			p_lng: input.lng,
			p_name: input.name,
			p_description: input.description,
			p_severity: input.severity,
			p_radius_m: input.radius_m,
			p_expires_at: input.expires_at,
		});

		return expectSinglePin(rpc.data as PinRpcRow[] | null, rpc.error);
	}

	static async update(id: string, input: PinUpdateInput): Promise<Pin | null> {
		const { data, error } = await supabase
			.from('pins')
			.update({
				lat: input.lat,
				lng: input.lng,
				name: input.name,
				description: input.description,
				severity: input.severity,
				radius_m: input.radius_m,
				status: input.status,
			})
			.eq('id', id)
			.select(PIN_COLUMNS)
			.maybeSingle();

		if (!error) {
			return (data as Pin | null) ?? null;
		}

		const rpc = await supabase.rpc('update_pin', {
			p_pin_id: id,
			p_lat: input.lat,
			p_lng: input.lng,
			p_name: input.name,
			p_description: input.description,
			p_severity: input.severity,
			p_radius_m: input.radius_m,
			p_status: input.status,
		});

		if (rpc.error) {
			throw new Error(rpc.error.message);
		}

		if (!rpc.data || rpc.data.length === 0) {
			return null;
		}

		return rpc.data[0] as Pin;
	}

	static async delete(id: string): Promise<boolean> {
		const { data, error } = await supabase
			.from('pins')
			.delete()
			.eq('id', id)
			.select('id')
			.maybeSingle();

		if (!error) {
			return Boolean(data?.id);
		}

		const rpc = await supabase.rpc('delete_pin', {
			p_pin_id: id,
		});

		if (rpc.error) {
			throw new Error(rpc.error.message);
		}

		return Boolean(rpc.data);
	}
}
