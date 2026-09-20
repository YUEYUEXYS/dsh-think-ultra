// Local JSON config: the ONLY experimental surface for the hidden 极高 tier.
// File: <DSH_HOME>/thinking-ultra.config.json — edited by hand, read locally,
// never fetched from anywhere. tier: 'extreme' unlocks 极高 (v0.1 keeps it
// out of the UI by design; the UI layer unlocks in v0.14).

import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
                                                                                   
import { CONFIG_FILENAME } from '../shared/constants.js';

                              
                               
                                 
                                 
                                 
                       
                          
                       
 

export function configHome()         {
  if (process.env.DSH_HOME && process.env.DSH_HOME.length > 0) return process.env.DSH_HOME;
  return join(homedir(), '.dsh');
}

export function configPath(home         )         {
  return join(home ?? configHome(), CONFIG_FILENAME);
}

export function defaultConfig()              {
  return {
    tier: 'standard',
    modules: {},
    globals: {},
    sliders: {},
    kvBudgetTokens: 96000,
    branchCount: 3,
  };
}

                                
                      
               
                  
                           
                 
 

export function loadLocalConfig(home         )                {
  const path = configPath(home);
  if (!existsSync(path)) {
    return { config: defaultConfig(), path, loaded: false, extremeUnlocked: false };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('config root must be a JSON object');
    }
    const cfg              = { ...defaultConfig(), ...parsed };
    if (cfg.tier !== 'standard' && cfg.tier !== 'extreme') cfg.tier = 'standard';
    return { config: cfg, path, loaded: true, extremeUnlocked: cfg.tier === 'extreme' };
  } catch (err) {
    return {
      config: defaultConfig(),
      path,
      loaded: false,
      extremeUnlocked: false,
      error: '配置读取失败，已回退默认值: ' + String(err instanceof Error ? err.message : err),
    };
  }
}

export function saveLocalConfig(cfg             , home         )                                   {
  const path = configPath(home);
  try {
    writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    return { path };
  } catch (err) {
    return { path, error: String(err instanceof Error ? err.message : err) };
  }
}

export function mergeConfig(cfg             , base                                                                      ) {
  return {
    modules: { ...base.modules, ...(cfg.modules ?? {}) },
    globals: { ...base.globals, ...(cfg.globals ?? {}) },
    sliders: { ...base.sliders, ...(cfg.sliders ?? {}) },
    snapshotDir: cfg.snapshotDir,
    kvBudgetTokens: cfg.kvBudgetTokens ?? 96000,
    branchCount: cfg.branchCount ?? 3,
  };
}

