/**
 * Flow registry — maps OTA + platform + flow type to the flow class.
 */

import { AgodaHotelOL } from './agoda-hotel-ol.js';
import { AgodaFlightOL } from './agoda-flight-ol.js';

const FLOWS = {
  'agoda-ol-hotel': AgodaHotelOL,
  'agoda-ol-flight': AgodaFlightOL,
};

export function getFlow(ota, platform, flowType) {
  const key = `${ota}-${platform}-${flowType}`;
  const FlowClass = FLOWS[key];
  if (!FlowClass) {
    throw new Error(`No flow found for: ${key}. Available: ${Object.keys(FLOWS).join(', ')}`);
  }
  return new FlowClass();
}

export function listFlows() {
  return Object.keys(FLOWS).map((key) => {
    const [ota, platform, flowType] = key.split('-');
    return { ota, platform, flowType, key };
  });
}
