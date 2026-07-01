import type { Pin } from '../types/index.js';
import { sendEmail } from '../notifications/index.js';
import { UserService } from './UserService.js';

function buildAlertBody(pin: Pin): string {
  const title = pin.name ?? 'Unnamed hazard';
  const description = pin.description ?? 'No description provided.';
  return [
    `A new ${pin.severity}-severity hazard was reported near you.`,
    '',
    `Hazard: ${title}`,
    `Severity: ${pin.severity}`,
    `Description: ${description}`,
    '',
    'Stay safe — PinPoint',
  ].join('\n');
}

export class AlertService {
  /**
   * Notify users whose saved location falls within the pin's radius.
   * Best-effort: a failure to find recipients or send any email is logged
   * and never propagated, so it can't break pin creation.
   *
   * @returns the number of emails successfully sent.
   */
  static async notifyNearbyUsers(pin: Pin): Promise<number> {
    let recipients;
    try {
      recipients = await UserService.findWithinRadius(
        pin.lat,
        pin.lng,
        pin.radius_m,
        pin.reporter_id,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('AlertService: failed to look up nearby users:', error);
      return 0;
    }

    // eslint-disable-next-line no-console
    console.log(
      `AlertService: pin ${pin.id} at (${pin.lat}, ${pin.lng}) radius=${pin.radius_m}m reporter=${pin.reporter_id ?? 'anonymous'} → ${recipients.length} recipient(s) within radius`,
    );

    if (recipients.length === 0) {
      // eslint-disable-next-line no-console
      console.log(
        'AlertService: no emails sent — no alerts-enabled users with a saved location inside the pin radius (the reporter is always excluded).',
      );
      return 0;
    }

    const subject = `PinPoint alert: ${pin.severity} hazard nearby`;
    const body = buildAlertBody(pin);

    let sent = 0;
    for (const user of recipients) {
      try {
        await sendEmail(user.email, body, { subject });
        sent += 1;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`AlertService: failed to email ${user.email}:`, error);
      }
    }
    return sent;
  }
}
