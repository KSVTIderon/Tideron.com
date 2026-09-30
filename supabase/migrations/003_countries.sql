-- ─── Landtabell ──────────────────────────────────────────────────────────────
create table if not exists countries (
  code                char(2) primary key,  -- ISO 3166-1 alpha-2
  name                text not null,
  name_en             text not null,
  currency_code       char(3) not null,
  currency_symbol     text not null,
  flag                text not null,        -- emoji
  corporate_tax_rate  numeric not null,     -- desimal, f.eks. 0.22
  vat_rate            numeric not null,
  energy_subsidy_pct  numeric default 0,    -- % av CAPEX som kan subsidies
  feed_in_tariff      numeric,              -- kr/kWh ekvivalent (lokal valuta)
  regulatory_notes    text,
  language            char(2) default 'en'
);

-- ─── Land på prosjekter ───────────────────────────────────────────────────────
alter table projects
  add column if not exists country_code char(2) references countries(code) default 'NO',
  add column if not exists currency_code char(3) default 'NOK';

-- ─── Seed: Norden ─────────────────────────────────────────────────────────────
insert into countries values
  ('NO','Norge','Norway','NOK','kr','🇳🇴',0.22,0.25,0.45,null,'NVE-konsesjon påkrevd. Enova-støtte tilgjengelig.',  'no'),
  ('SE','Sverige','Sweden','SEK','kr','🇸🇪',0.206,0.25,0.30,null,'Energimyndigheten. Elcertifikat-støtte.',             'sv'),
  ('DK','Danmark','Denmark','DKK','kr','🇩🇰',0.22,0.25,0.30,null,'Energistyrelsen. PSO-ordning avviklet.',             'da'),
  ('FI','Finland','Finland','EUR','€','🇫🇮',0.20,0.24,0.30,null,'Energivirasto.',                                     'fi'),
  ('IS','Island','Iceland','ISK','kr','🇮🇸',0.20,0.24,0,null,'Orkustofnun. Geotermisk dominert.',                   'is')
on conflict (code) do nothing;

-- ─── Seed: Engelskspråklige ───────────────────────────────────────────────────
insert into countries values
  ('CA','Canada','Canada','CAD','$','🇨🇦',0.265,0.05,0.40,null,'CER konsesjon. ITC-skattefradrag 30%.',              'en'),
  ('US','USA','USA','USD','$','🇺🇸',0.21,0,0.30,null,'FERC-konsesjon. ITC/PTC tilgjengelig.',               'en'),
  ('GB','Storbritannia','United Kingdom','GBP','£','🇬🇧',0.25,0.20,0.35,null,'Environment Agency. CfD-auksjoner.',   'en'),
  ('AU','Australia','Australia','AUD','$','🇦🇺',0.30,0.10,0.30,null,'ARENA-støtte. AEMO-regulert.',                 'en'),
  ('NZ','New Zealand','New Zealand','NZD','$','🇳🇿',0.28,0.15,0.25,null,'MfE-konsesjon. EECA-støtte.',               'en'),
  ('IE','Irland','Ireland','EUR','€','🇮🇪',0.125,0.23,0.30,null,'SEAI-støtte. RESS-auksjon.',                       'en'),
  ('ZA','Sør-Afrika','South Africa','ZAR','R','🇿🇦',0.27,0.15,0.35,null,'NERSA-lisens. REIPPPP-program.',            'en'),
  ('GH','Ghana','Ghana','GHS','₵','🇬🇭',0.25,0.15,0.40,null,'EC Ghana. GEDAP-støtte.',                             'en'),
  ('NG','Nigeria','Nigeria','NGN','₦','🇳🇬',0.30,0.075,0.35,null,'NERC-lisens. REF-støtte.',                       'en'),
  ('KE','Kenya','Kenya','KES','Ksh','🇰🇪',0.30,0.16,0.40,null,'ERC Kenya. SREP-støtte.',                           'en'),
  ('TZ','Tanzania','Tanzania','TZS','TSh','🇹🇿',0.30,0.18,0.40,null,'EWURA-lisens.',                               'en'),
  ('UG','Uganda','Uganda','UGX','USh','🇺🇬',0.30,0.18,0.40,null,'ERA Uganda.',                                    'en'),
  ('ET','Etiopia','Ethiopia','ETB','Br','🇪🇹',0.30,0.15,0.40,null,'EEA-lisens.',                                   'en'),
  ('SN','Senegal','Senegal','XOF','Fr','🇸🇳',0.30,0.18,0.40,null,'CRSE-regulert.',                                 'fr'),
  ('PH','Filippinene','Philippines','PHP','₱','🇵🇭',0.25,0.12,0.50,null,'ERC Philippines. FIT-program.',            'en'),
  ('ID','Indonesia','Indonesia','IDR','Rp','🇮🇩',0.22,0.11,0.45,null,'MEMR-lisens. PLN-samarbeid.',                 'id'),
  ('BD','Bangladesh','Bangladesh','BDT','৳','🇧🇩',0.275,0.15,0.50,null,'BERC-lisens. SREDA-støtte.',               'bn'),
  ('IN','India','India','INR','₹','🇮🇳',0.25,0.18,0.40,null,'CERC/SERC-regulert. MNRE-støtte.',                  'hi'),
  ('PK','Pakistan','Pakistan','PKR','Rs','🇵🇰',0.29,0.17,0.40,null,'NEPRA-lisens.',                               'ur'),
  ('VN','Vietnam','Vietnam','VND','₫','🇻🇳',0.20,0.10,0.40,null,'EVN-kontrakt. FIT tilgjengelig.',                 'vi'),
  ('MM','Myanmar','Myanmar','MMK','K','🇲🇲',0.25,0.05,0.45,null,'MOEE-lisens.',                                   'my'),
  ('KH','Kambodsja','Cambodia','KHR','៛','🇰🇭',0.20,0.10,0.50,null,'EAC-lisens.',                                 'km'),
  ('PG','Papua Ny-Guinea','Papua New Guinea','PGK','K','🇵🇬',0.30,0.10,0.50,null,'PPL-regulert.',                  'en'),
  ('SB','Salomonøyene','Solomon Islands','SBD','$','🇸🇧',0.30,0.15,0.50,null,'SIEA-regulert.',                    'en'),
  ('FJ','Fiji','Fiji','FJD','$','🇫🇯',0.20,0.09,0.50,null,'FEA-regulert.',                                        'en'),
  ('CO','Colombia','Colombia','COP','$','🇨🇴',0.35,0.19,0.40,null,'CREG-regulert. Ley 1715 incentiver.',           'es'),
  ('PE','Peru','Peru','PEN','S/','🇵🇪',0.295,0.18,0.40,null,'OSINERGMIN-regulert.',                               'es'),
  ('EC','Ecuador','Ecuador','USD','$','🇪🇨',0.25,0.12,0.45,null,'ARCONEL-lisens.',                                 'es'),
  ('JM','Jamaica','Jamaica','JMD','$','🇯🇲',0.25,0.15,0.50,null,'OUR Jamaica.',                                   'en'),
  ('TT','Trinidad og Tobago','Trinidad and Tobago','TTD','$','🇹🇹',0.30,0.125,0.40,null,'RIC-regulert.',           'en')
on conflict (code) do nothing;
