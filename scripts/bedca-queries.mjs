// XML query builders for the BEDCA public API (https://www.bedca.net/bdpub/procquery.php).
// The API is undocumented; the query format comes from the official web client and the
// statickidz/bedca-api + pybedca open-source wrappers.

export const ENDPOINT = 'https://www.bedca.net/bdpub/procquery.php';

export const foodGroupsQuery = `<?xml version="1.0" encoding="utf-8"?>
<foodquery>
  <type level="3"/>
  <selection>
    <atribute name="fg_id"/>
    <atribute name="fg_ori_name"/>
    <atribute name="fg_eng_name"/>
  </selection>
  <order ordtype="ASC"><atribute3 name="fg_id"/></order>
</foodquery>`;

export const foodsOfGroupQuery = (groupId) => `<?xml version="1.0" encoding="utf-8"?>
<foodquery>
  <type level="1"/>
  <selection>
    <atribute name="f_id"/>
    <atribute name="f_ori_name"/>
    <atribute name="f_eng_name"/>
    <atribute name="f_origen"/>
  </selection>
  <condition>
    <cond1><atribute1 name="foodgroup_id"/></cond1>
    <relation type="EQUAL"/>
    <cond3>${groupId}</cond3>
  </condition>
  <order ordtype="ASC"><atribute3 name="f_eng_name"/></order>
</foodquery>`;

export const foodDetailQuery = (foodId) => `<?xml version="1.0" encoding="utf-8"?>
<foodquery>
  <type level="2"/>
  <selection>
    <atribute name="f_id"/>
    <atribute name="f_ori_name"/>
    <atribute name="f_eng_name"/>
    <atribute name="edible_portion"/>
    <atribute name="c_id"/>
    <atribute name="eur_name"/>
    <atribute name="best_location"/>
    <atribute name="v_unit"/>
  </selection>
  <condition>
    <cond1><atribute1 name="f_id"/></cond1>
    <relation type="EQUAL"/>
    <cond3>${foodId}</cond3>
  </condition>
  <condition>
    <cond1><atribute1 name="publico"/></cond1>
    <relation type="EQUAL"/>
    <cond3>1</cond3>
  </condition>
  <order ordtype="ASC"><atribute3 name="componentgroup_id"/></order>
</foodquery>`;

export async function bedcaFetch(xml, { retries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'User-Agent': 'NutriSwap/0.1 (https://github.com/Xuplus/NutriSwap)',
        },
        body: xml,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt > retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}
