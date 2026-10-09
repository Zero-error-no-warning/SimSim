// Follow the same visible entry points a user uses; never force hidden controls.
export async function showNavigator(page,pane='unit') {
  const workspace=page.locator('.workspace');
  if(await workspace.evaluate(e=>e.classList.contains('configuration-mode')))return;
  if(await page.locator('#navigator-toggle').getAttribute('aria-pressed')!=='true')await page.locator('#navigator-toggle').click();
  const tab=page.locator('[data-browser-pane="'+pane+'"]:visible');
  if(await tab.getAttribute('aria-pressed')!=='true')await tab.click();
}
export async function ensureWorkspaceControl(page,id){
  const control=page.locator('#'+id);if(await control.isVisible())return;
  const menu={viewtop:'display-menu',view3d:'display-menu','authoring-toggle':'edit-menu','terrain-edit':'edit-menu','scenario-settings-open':'edit-menu','plan-manager-open':'edit-menu',step:'playback-menu',reset:'playback-menu',speed:'playback-menu'}[id];
  if(menu){await page.locator('#'+menu+' > summary').click();return;}
  if(['events-open','record-save','route-check-open'].includes(id)){await page.locator('#results-open').click();return;}
  if(['duration','seed','trial','next-trial','record-step','record-interval'].includes(id)){await page.locator('#calculation-settings-open').click();return;}
  if(['plan-select','plan-save','plan-menu'].includes(id)){await clickWorkspace(page,'plan-manager-open');return;}
  if(id==='behaviors-open'){await showNavigator(page,'task');return;}
  if(['settings-open','unit-task-open'].includes(id)){if(await page.locator('#inspector-toggle').getAttribute('aria-pressed')!=='true')await page.locator('#inspector-toggle').click();return;}
}
export async function clickWorkspace(page,id){await ensureWorkspaceControl(page,id);await page.locator('#'+id).click();}

export async function selectWorkspace(page,id,value){await ensureWorkspaceControl(page,id);await page.locator('#'+id).selectOption(value);}
