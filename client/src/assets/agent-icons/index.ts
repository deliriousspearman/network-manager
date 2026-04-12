import wazuhIcon from './wazuh.svg?url';
import zabbixIcon from './zabbix.svg?url';
import elkIcon from './elk.svg?url';
import prometheusIcon from './prometheus.svg?url';
import grafanaIcon from './grafana.svg?url';
import nagiosIcon from './nagios.svg?url';
import datadogIcon from './datadog.svg?url';
import splunkIcon from './splunk.svg?url';
import ossecIcon from './ossec.svg?url';
import customAgentIcon from './custom.svg?url';

export const DEFAULT_AGENT_ICONS: Record<string, string> = {
  wazuh: wazuhIcon,
  zabbix: zabbixIcon,
  elk: elkIcon,
  prometheus: prometheusIcon,
  grafana: grafanaIcon,
  nagios: nagiosIcon,
  datadog: datadogIcon,
  splunk: splunkIcon,
  ossec: ossecIcon,
  custom: customAgentIcon,
};
