import { supabase } from '../lib/supabase.js';
import { boundingBox, haversineMeters } from '../lib/geo.js';

/** A user with a known location, eligible for proximity alerts. */
export interface NearbyUser {
  id: string;
  email: string;
  display_name: string;
  lat: number;
  lng: number;
}

export class UserService {
  /** Persist a user's last known location (opt-in, used for alerts). */
  static async setLocation(
    userId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ lat, lng })
      .eq('id', userId);
    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Find users whose saved location is within `radiusM` meters of a point.
   * Uses a bounding-box SQL prefilter, then refines with Haversine.
   */
  static async findWithinRadius(
    lat: number,
    lng: number,
    radiusM: number,
    excludeUserId?: string | null,
  ): Promise<NearbyUser[]> {
    const box = boundingBox(lat, lng, radiusM);

    const { data, error } = await supabase
      .from('users')
      .select('id, email, display_name, lat, lng')
      .eq('alerts_enabled', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', box.minLat)
      .lte('lat', box.maxLat)
      .gte('lng', box.minLng)
      .lte('lng', box.maxLng);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as NearbyUser[];
    return rows.filter(
      (user) =>
        user.id !== excludeUserId &&
        haversineMeters(lat, lng, user.lat, user.lng) <= radiusM,
    );
  }
}
