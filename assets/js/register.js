import { requireSupabase, showConfigurationNotice } from './supabase-client.js';
import { confirmationRedirect } from './auth.js';
import { setBusy, setMessage } from './ui.js';

const form=document.getElementById('registrationForm');
const message=document.getElementById('formMessage');
const submitButton=form.querySelector('button[type="submit"]');
if(showConfigurationNotice(document.getElementById('configMessage')))submitButton.disabled=true;

form.addEventListener('submit',async(event)=>{
  event.preventDefault();setMessage(message);
  const password=document.getElementById('password').value;
  if(password!==document.getElementById('confirmPassword').value)return setMessage(message,'The password confirmation does not match.','error');
  try{
    setBusy(submitButton,true,'Creating account…');
    const {data,error}=await requireSupabase().auth.signUp({
      email:document.getElementById('email').value.trim(),password,
      options:{data:{full_name:document.getElementById('fullName').value.trim(),phone:document.getElementById('phone').value.trim(),terms_accepted:document.getElementById('termsAccepted').checked},emailRedirectTo:confirmationRedirect()}
    });
    if(error)throw error;form.reset();
    setMessage(message,`Operator account created.${data.session?' Open the operator dashboard to register your business.':' Check your email to confirm the account, then log in and register your business.'}`,'success');
  }catch(error){setMessage(message,error.message||'The operator account could not be created.','error');}
  finally{setBusy(submitButton,false);}
});
