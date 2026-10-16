import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {totp} from '../../apps/api/src/totp';

const execute=promisify(execFile);
async function operator(command:'grant'|'revoke',email:string){
  await execute(process.execPath,['--env-file=.local/browser-tests.env','node_modules/tsx/dist/cli.mjs','--tsconfig','apps/api/tsconfig.json','apps/api/src/staff-operator.ts',command,'--email',email,'--environment','development','--reason','Isolated browser fixture access',...(command==='grant'?['--scopes','SUPPORT']:[])],{timeout:30_000});
}
test('staff MFA enrollment, scoped console, audit and authenticator recovery',async({page})=>{
  test.setTimeout(150_000);const email=`staff-browser-${Date.now()}@example.test`;const password='Staff-browser-password-321!';let granted=false;
  try{
    await page.goto('/auth/signup');await page.getByLabel('Your name').fill('Browser Operator');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
    const registered=page.waitForResponse(r=>r.url().endsWith('/v1/auth/registrations')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create account',exact:true}).click();expect((await registered).status()).toBe(202);
    await page.getByRole('link',{name:'Open captured email inbox'}).click();await page.getByRole('listitem').filter({hasText:email}).getByRole('link',{name:'Open verification link'}).click();await page.getByRole('button',{name:'Verify email',exact:true}).click();await expect(page.getByRole('heading',{name:'Email verified',exact:true})).toBeVisible();
    await operator('grant',email);granted=true;
    await page.goto('/auth/signin');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
    const login=page.waitForResponse(r=>r.url().endsWith('/v1/auth/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();expect((await login).status()).toBe(200);
    await page.getByRole('link',{name:'Open staff console'}).click();await expect(page.getByRole('heading',{name:'Set up staff MFA',exact:true})).toBeVisible();
    await page.getByLabel('Account password').fill(password);await page.getByRole('button',{name:'Create authenticator setup',exact:true}).click();
    const secret=await page.getByLabel('Authenticator setup key').textContent();await page.getByLabel('Authenticator code').fill(totp(secret!.trim(),new Date()));await page.getByRole('button',{name:'Confirm MFA',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Save your recovery codes',exact:true})).toBeVisible();
    const backup=await page.getByRole('listitem').first().textContent();await page.getByRole('button',{name:'I saved my recovery codes',exact:true}).click();
    const areas=page.getByRole('navigation',{name:'Staff areas'});await expect(areas.getByRole('button',{name:'Support',exact:true})).toBeVisible();await expect(areas.getByRole('button',{name:'Trust',exact:true})).toHaveCount(0);await expect(areas.getByRole('button',{name:'Finance',exact:true})).toHaveCount(0);
    await areas.getByRole('button',{name:'Support',exact:true}).click();await page.getByLabel('Reason for access').fill('Review support console access');await page.getByRole('button',{name:'Record access reason',exact:true}).click();await expect(page.getByRole('listitem').filter({hasText:'Review support console access'})).toBeVisible();
    await page.getByRole('link',{name:'Monitor notification delivery',exact:true}).click();
    await page.getByLabel('Reason for notification access').fill('Inspect isolated delivery backlog');
    await page.getByRole('button',{name:'Inspect delivery queue',exact:true}).click();
    await expect(page.getByText('No queued notifications.',{exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Back to staff console',exact:true}).click();
    await page.getByRole('button',{name:'Sign out staff access',exact:true}).click();await expect(page.getByRole('heading',{name:'Verify staff access',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Lost your authenticator?',exact:true}).click();await page.getByLabel('Account password').fill(password);await page.getByLabel('Recovery code').fill(backup!.trim());await page.getByRole('button',{name:'Use recovery code',exact:true}).click();await expect(page.getByRole('heading',{name:'Set up staff MFA',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Staff areas'})).toHaveCount(0);
    await page.getByLabel('Account password').fill(password);await page.getByRole('button',{name:'Create authenticator setup',exact:true}).click();const next=await page.getByLabel('Authenticator setup key').textContent();expect(next).not.toBe(secret);
    await page.getByLabel('Authenticator code').fill(totp(next!.trim(),new Date()));await page.getByRole('button',{name:'Confirm MFA',exact:true}).click();await expect(page.getByRole('heading',{name:'Save your recovery codes',exact:true})).toBeVisible();await page.getByRole('button',{name:'I saved my recovery codes',exact:true}).click();
    await operator('revoke',email);granted=false;await page.reload();await expect(page.getByRole('main').getByRole('status').filter({hasText:'Staff access has not been assigned'})).toBeVisible();
  }finally{if(granted)await operator('revoke',email);}
});
