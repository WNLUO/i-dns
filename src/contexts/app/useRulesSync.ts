import {useEffect} from 'react';
import {DomainRule} from '../../types';
import filterRulesService from '../../services/filterRules';
import vpnService from '../../services/vpnService';

export const useRulesSync = (
  blacklist: DomainRule[],
  whitelist: DomainRule[],
  childProtectionMode: boolean,
) => {
  useEffect(() => {
    const blacklistDomains = blacklist.map(rule => rule.domain);
    const whitelistDomains = whitelist.map(rule => rule.domain);
    filterRulesService.loadCustomRules(blacklistDomains, whitelistDomains);

    if (vpnService.isAvailable()) {
      // 这里可以批量更新 VPN 的黑白名单
      // 由于目前 VPN 接口是单个添加，这里仅作示意
    }
  }, [blacklist, whitelist]);

  useEffect(() => {
    filterRulesService.setChildProtectionMode(childProtectionMode);
  }, [childProtectionMode]);
};
