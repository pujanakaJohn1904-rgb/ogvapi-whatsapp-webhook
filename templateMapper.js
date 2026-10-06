/**
 * Utility to map Vapi serviceType to WhatsApp pre-approved template names.
 *
 * @param {string} serviceType - The incoming service type string from Vapi payload
 * @returns {string} The mapped WhatsApp template name
 */
function getTemplateName(serviceType) {
  if (!serviceType || typeof serviceType !== 'string') {
    return 'diesel_fleet_alert_v1';
  }

  const lowerServiceType = serviceType.toLowerCase();

  if (lowerServiceType.includes('reefer')) {
    return 'reefer_repair_alert_v1';
  }

  if (lowerServiceType.includes('tire') || lowerServiceType.includes('otr')) {
    return 'otr_tire_alert_v1';
  }

  if (lowerServiceType.includes('hydraulic')) {
    return 'hydraulic_repair_alert_v1';
  }

  return 'diesel_fleet_alert_v1';
}

module.exports = { getTemplateName };
