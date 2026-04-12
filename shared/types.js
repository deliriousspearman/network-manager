export const DEVICE_TYPE_LABELS = {
    server: 'Server',
    workstation: 'Workstation',
    router: 'Router',
    switch: 'Switch',
    nas: 'NAS',
    firewall: 'Firewall',
    access_point: 'Access Point',
    iot: 'IoT Device',
    camera: 'Camera',
    phone: 'Phone',
};
// Router config types
export const ROUTER_VENDORS = ['cisco', 'unifi', 'mikrotik', 'juniper', 'fortigate', 'pfsense'];
export const ROUTER_VENDOR_LABELS = {
    cisco: 'Cisco IOS',
    unifi: 'Unifi',
    mikrotik: 'Mikrotik RouterOS',
    juniper: 'Juniper JunOS',
    fortigate: 'FortiGate',
    pfsense: 'pfSense',
};
export const CREDENTIAL_TYPES = ['SSH', 'RDP', 'HTTP', 'SNMP', 'SQL', 'VPN', 'SSH Key', 'Other'];
// Timeline types
export const TIMELINE_CATEGORIES = ['general', 'decision', 'change', 'incident', 'milestone', 'note'];
export const TIMELINE_CATEGORY_LABELS = {
    general: 'General',
    decision: 'Decision',
    change: 'Change',
    incident: 'Incident',
    milestone: 'Milestone',
    note: 'Note',
};
// Agent types
export const AGENT_TYPES = ['wazuh', 'zabbix', 'elk', 'prometheus', 'grafana', 'nagios', 'datadog', 'splunk', 'ossec', 'custom'];
export const AGENT_TYPE_LABELS = {
    wazuh: 'Wazuh', zabbix: 'Zabbix', elk: 'ELK', prometheus: 'Prometheus',
    grafana: 'Grafana', nagios: 'Nagios', datadog: 'Datadog', splunk: 'Splunk',
    ossec: 'OSSEC', custom: 'Custom',
};
export const AGENT_STATUSES = ['active', 'inactive', 'error', 'unknown'];
export const AGENT_STATUS_LABELS = {
    active: 'Active', inactive: 'Inactive', error: 'Error', unknown: 'Unknown',
};
//# sourceMappingURL=types.js.map