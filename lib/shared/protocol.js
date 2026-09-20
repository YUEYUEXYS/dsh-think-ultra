// Shared protocol types for Think (host <-> Rust core <-> client).
// Pure types — erased at build; the runtime mirror is plain JSON.

                              
                  
                    
                 
                    
                   
 

                              
                 
                        
                      
                    
 

                              
                                                           
               
                 
                               
                                   
                                
 

                             
                  
                                                          
                    
                       
                       
                       
                   
                           
 

// ═══════════════════════════════════════════════════════════════
//  ULTRA 铁律：极致质量优先，非速度优先；但绝不死循环。
//  底层写死，不靠提示词。所有默认参数偏向"把任务做到极好最好"，
//  同时 antiloop + execgate + 三层熔断（最大轮次/单工具超时/总token预算）
//  确保推理不会无限循环。关了对应开关就真不跑、不烧 token。
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_MODULES              = {
  review: true, branches: true, cache: true, snapshot: true, project: true,
  // 高级锻造区：四条重型独立 LLM 通道总闸 + 防自激收敛硬闸（默认全开）
  treeforge: true, judgepanel: true, execgate: true, l3forge: true, antiloop: true,
  // L0 确定性核验（本地零 LLM 真值判定：算术/日期/计数/单位），零成本默认开
  grounding: true,
  // 质量优先：bestof 多候选择优默认开（关了就只出单候选，更快但质量降）
  bestof: true, devil: true, recheck: true,
};

export const DEFAULT_GLOBALS              = {
  cache: true, autosnapshot: true, driftAlert: true, debugLog: true,
};

// 滑杆预算：全部偏向质量深推。vision/meta 默认 0 是因为需用户按需开启（视觉/元认知开销极大），
// 但 deep/branch/memory/code 全部拉到 3（质量档），safety/heal 拉到 4（强保护），
// reclaim 保持 3 防止内存爆炸。档位上限由 oc-core/constants 钳制，不会越界。
export const DEFAULT_SLIDERS              = { deep: 3, branch: 3, memory: 3, code: 3, vision: 0, meta: 0, safety: 4, heal: 4, reclaim: 3 };

                                 
             
                 
                                   
 

                                  
                    
              
                   
                        
 

// Panel -> host (POST /thinking-ultra/api/state)
                                   
                  
                    
               
                       
                       
                       
 

                                    
              
                           
                             
                 
 

// Host -> panel (SSE /thinking-ultra/events)
                        
                                                                                               
                                                                                                        
                                                                                                                                
                                                                                                                                  
                                                                                                                 
                                                                                                                              
                                                                                  

                              
                    
                            
                            
                              
                              
                         
                               
 

                               
                
                          
                    
                      
                       
                          
                        
                        
                       
                     
                   
                    
                 
                        
 

                                
                    
                          
                      
                            
                                    
                                                                                                               
                                                         
 

