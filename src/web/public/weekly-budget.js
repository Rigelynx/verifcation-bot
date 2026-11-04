(() => {
    let panel,data,editing=null;
    const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
    async function api(path='',body,method='POST') {
        const response=await fetch('/api/admin/weekly-budget'+path,{method:body?method:'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${typeof adminToken==='undefined'?'':adminToken}`},...(body?{body:JSON.stringify(body)}:{})});
        const result=await response.json();if(!response.ok)throw new Error(result.message||'No se pudo cargar el presupuesto.');return result;
    }
    function mount(){
        const settings=document.getElementById('economy-settings-form');if(!settings)return false;
        panel=make('section');panel.className='weekly-budget ops-card';
        panel.innerHTML=`<h3>Presupuesto semanal</h3><p>Planifica armamento, infantería y logística. Los importes se repiten por semana hasta que edites o pauses cada partida. Este presupuesto no descuenta cuentas.</p><button type="button" class="btn-retro" data-refresh>Actualizar</button><p data-feedback role="status"></p><div data-items></div><form data-item><div class="branding-fields"><label>Nombre<input name="name" maxlength="100" required></label><label>Categoría<select name="category"></select></label><label>Previsto por semana<input name="planned" type="number" min="0" max="1000000000" required value="0"></label><label>Gasto registrado por semana<input name="actual" type="number" min="0" max="1000000000" required value="0"></label></div><label><input name="active" type="checkbox" checked> Partida activa</label><button class="btn-retro" type="submit">Guardar partida</button><button type="button" class="btn-retro" data-new>Nueva partida</button></form><hr><form data-schedule><h4>Informe automático cada siete días</h4><div class="branding-fields"><label>ID del canal de Discord<input name="channel_id" pattern="[0-9]{17,20}" required></label><label>Primer envío · hora de este dispositivo<input name="next_at" type="datetime-local" required></label></div><label><input name="enabled" type="checkbox"> Habilitar informes semanales</label><button class="btn-retro" type="submit">Guardar programación</button></form><div data-reports></div>`;
        settings.after(panel);
        panel.querySelector('[data-refresh]').onclick=load;
        panel.querySelector('[data-new]').onclick=()=>{editing=null;panel.querySelector('[data-item]').reset();};
        panel.querySelector('[data-item]').onsubmit=event=>submit(event,async form=>{
            await api('/items',{...(editing?{id:editing}:{}),name:form.elements.name.value,category:form.elements.category.value,planned:Number(form.elements.planned.value),actual:Number(form.elements.actual.value),active:form.elements.active.checked});editing=null;form.reset();
        });
        panel.querySelector('[data-schedule]').onsubmit=event=>submit(event,async form=>{
            await api('/schedule',{channel_id:form.elements.channel_id.value,enabled:form.elements.enabled.checked,next_at:new Date(form.elements.next_at.value).toISOString()},'PUT');
        });return true;
    }
    async function submit(event,fn){event.preventDefault();const form=event.target,button=form.querySelector('[type=submit]');button.disabled=true;try{await fn(form);await load();panel.querySelector('[data-feedback]').textContent='Guardado.';}catch(error){panel.querySelector('[data-feedback]').textContent=error.message;}finally{button.disabled=false;}}
    async function load(){
        if(!panel&&!mount())return;
        try{data=await api();const list=panel.querySelector('[data-items]');list.replaceChildren();
            const form=panel.querySelector('[data-item]');const select=form.elements.category;const previous=select.value;select.replaceChildren();for(const category of data.categories){const option=make('option',category);option.value=category;select.append(option);}if(previous)select.value=previous;
            let planned=0,actual=0;
            for(const item of data.items){const row=make('p',`${item.category} · ${item.name} · previsto ${item.planned} · registrado ${item.actual} · ${item.active?'Activa':'Pausada'} `);const button=make('button','Editar');button.className='btn-retro';button.onclick=()=>{editing=item.id;for(const key of ['category','name','planned','actual'])form.elements[key].value=item[key];form.elements.active.checked=Boolean(item.active);form.scrollIntoView({block:'nearest'});};row.append(button);list.append(row);if(item.active){planned+=item.planned;actual+=item.actual;}}
            list.prepend(make('p',`Total semanal: previsto ${planned} · registrado ${actual} · diferencia ${planned-actual}`));
            const schedule=panel.querySelector('[data-schedule]');if(data.schedule){schedule.elements.channel_id.value=data.schedule.channel_id;schedule.elements.enabled.checked=Boolean(data.schedule.enabled);const at=new Date(data.schedule.next_at);schedule.elements.next_at.value=new Date(at-at.getTimezoneOffset()*60000).toISOString().slice(0,16);}
            const reports=panel.querySelector('[data-reports]');reports.replaceChildren(make('h4','Últimos informes'));
            for(const report of data.reports)reports.append(make('p',`${new Date(report.scheduled_at).toLocaleString()} · ${report.status}${report.error?' · '+report.error:''}`));
        }catch(error){panel.querySelector('[data-feedback]').textContent=error.message;}
    }
    window.loadWeeklyBudget=load;
})();
