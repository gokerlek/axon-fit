import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { programFormSchema } from './schemas/program.ts';
import { templateFormSchema } from './schemas/template.ts';
import {
  PROGRAM_DRAFT_BASE,
  TEMPLATE_DRAFT_BASE,
  draftConflict,
  draftDiffers,
  fitsForm,
  leaveHref,
  parseDraft,
  programDraftKey,
  serializeDraft,
  templateDraftKey,
  type LinkClick,
} from './unsaved-changes.ts';

const SHA = 'a'.repeat(40);
const at = '2026-09-25T09:00:00.000Z';

/** Formun girdisi: `getInput(form)` gibi, isteğe bağlı alanlar anahtarıyla `undefined`. */
function templateInput({ min }: { min: number | undefined } = { min: 8 }) {
  return {
    name: 'Alt vücut A',
    description: '',
    blocks: [
      {
        id: 'b_aaaaaa',
        kind: 'single',
        restSeconds: 90,
        transitionSeconds: undefined,
        rows: [
          {
            id: 'r_aaaaaa',
            exerciseId: 'squat',
            sets: [{ min, max: 12, loadPct: undefined, amrap: undefined }],
            rule: undefined,
            deviceId: undefined,
            note: '',
          },
        ],
      },
    ],
  };
}

function programInput() {
  return {
    phased: false,
    currentPhaseId: 'p_aaaaaa',
    phases: [{ id: 'p_aaaaaa', name: 'Evre 1', days: [{ id: 'd_aaaaaa', name: 'Gün A', blocks: templateInput().blocks }] }],
  };
}

const stored = (input: unknown, base: string | number | null = SHA) => serializeDraft({ version: 1, base, savedAt: at, input });

describe('taslak anahtarı', () => {
  test('şablon kimlikle, yeni şablon ve program danışanla', () => {
    assert.equal(templateDraftKey('t_5qq5ax0h'), 'pulsecoach.draft.template.t_5qq5ax0h');
    assert.equal(templateDraftKey(null), 'pulsecoach.draft.template.new');
    assert.equal(programDraftKey('c_uc942qx6'), 'pulsecoach.draft.program.c_uc942qx6');
  });
});

describe('taslak yazma ve okuma', () => {
  test('gidiş dönüş: boş sayı kutusu boş kalır, anahtar kaybolmaz', () => {
    const draft = parseDraft(stored(templateInput({ min: undefined })), templateFormSchema, TEMPLATE_DRAFT_BASE);
    assert.ok(draft);
    assert.equal(draft.base, SHA);
    assert.equal(draft.savedAt, at);
    const set = (draft.input as ReturnType<typeof templateInput>).blocks[0]?.rows[0]?.sets[0];
    assert.ok(set && 'min' in set);
    assert.equal(set.min, undefined);
    assert.equal(draftDiffers(draft.input, templateInput({ min: undefined })), false);
  });

  test('çözülemeyen sayı (NaN) boş kutu olarak döner', () => {
    const draft = parseDraft(stored(templateInput({ min: Number.NaN })), templateFormSchema, TEMPLATE_DRAFT_BASE);
    assert.ok(draft);
    assert.equal((draft.input as ReturnType<typeof templateInput>).blocks[0]?.rows[0]?.sets[0]?.min, undefined);
  });

  test('yarım iş kabul: kısa ad, boş gün listesi gibi kural ihlalleri', () => {
    assert.ok(parseDraft(stored({ ...templateInput(), name: '' }), templateFormSchema, TEMPLATE_DRAFT_BASE));
    assert.ok(parseDraft(stored({ ...templateInput(), blocks: [] }, null), templateFormSchema, TEMPLATE_DRAFT_BASE));
    const program = programInput();
    program.phases[0]!.days[0]!.blocks = [];
    assert.ok(parseDraft(stored(program, 3), programFormSchema, PROGRAM_DRAFT_BASE));
  });

  test('program: revision ya da oluşturmada null', () => {
    assert.equal(parseDraft(stored(programInput(), 7), programFormSchema, PROGRAM_DRAFT_BASE)?.base, 7);
    assert.equal(parseDraft(stored(programInput(), null), programFormSchema, PROGRAM_DRAFT_BASE)?.base, null);
  });

  test('bozuk, eski ya da başka biçimdeki taslak atılır', () => {
    const drop = (raw: string | null, schema: Parameters<typeof parseDraft>[1] = templateFormSchema) =>
      assert.equal(parseDraft(raw, schema, TEMPLATE_DRAFT_BASE), null);
    drop(null);
    drop('');
    drop('{bozuk');
    drop('[]');
    drop(JSON.stringify({ version: 2, base: SHA, savedAt: at, input: templateInput() }));
    drop(JSON.stringify({ version: 1, base: SHA, savedAt: 'dün', input: templateInput() }));
    drop(JSON.stringify({ version: 1, base: 42, savedAt: at, input: templateInput() }));
    drop(stored({ ...templateInput(), blocks: 'yok' }));
    drop(stored({ name: 'x', description: '' }));
    drop(stored({ ...templateInput(), blocks: [{ ...templateInput().blocks[0], kind: 'garip' }] }));
    drop(stored(templateInput(), SHA), programFormSchema);
    // Programın sürümü sayıdır.
    assert.equal(parseDraft(stored(programInput(), SHA), programFormSchema, PROGRAM_DRAFT_BASE), null);
  });

  test('şema denetimi yalnız yapıya bakar', () => {
    assert.equal(fitsForm(templateFormSchema, templateInput()), true);
    assert.equal(fitsForm(templateFormSchema, null), false);
    assert.equal(fitsForm(templateFormSchema, [templateInput()]), false);
    // Zorunlu sayı anahtarıyla yok: formun üretmeyeceği biçim.
    const input = templateInput();
    const set: Record<string, unknown> = { ...input.blocks[0]!.rows[0]!.sets[0] };
    delete set.min;
    input.blocks[0]!.rows[0]!.sets = [set as never];
    assert.equal(fitsForm(templateFormSchema, input), false);
  });

  test('__proto__ anahtarı girdiye taşınmaz', () => {
    const input = '{"__proto__":{"polluted":true},"name":"Alt","description":"","blocks":[]}';
    const raw = `{"version":1,"base":null,"savedAt":"${at}","input":${input}}`;
    const draft = parseDraft(raw, templateFormSchema, TEMPLATE_DRAFT_BASE);
    assert.ok(draft);
    assert.equal((draft.input as { polluted?: boolean }).polluted, undefined);
    assert.equal(Object.getPrototypeOf(draft.input), Object.prototype);
  });
});

describe('taslak farkı', () => {
  test('anahtar sırası ve boş değerler fark sayılmaz', () => {
    assert.equal(draftDiffers({ b: 1, a: [1, 2], c: undefined }, { a: [1, 2], b: 1 }), false);
    assert.equal(draftDiffers({ a: null }, {}), false);
  });

  test('değer, sıra ya da uzunluk farkı', () => {
    assert.equal(draftDiffers({ a: [1, 2] }, { a: [2, 1] }), true);
    assert.equal(draftDiffers({ a: [1] }, { a: [1, 1] }), true);
    assert.equal(draftDiffers({ name: 'A' }, { name: 'B' }), true);
    assert.equal(draftDiffers(templateInput({ min: 8 }), templateInput({ min: 10 })), true);
  });
});

describe('çakışma', () => {
  test('kayıttaki sürüm değiştiyse', () => {
    assert.equal(draftConflict(SHA, SHA), false);
    assert.equal(draftConflict(SHA, 'b'.repeat(40)), true);
    assert.equal(draftConflict(3, 4), true);
    // Oluşturmadan kalma taslak, o arada oluşturulmuş programın düzenlemesinde.
    assert.equal(draftConflict(null, 4), true);
  });

  test('oluşturmada çakışacak kayıt yok', () => {
    assert.equal(draftConflict(null, null), false);
    // Program o arada silinmiş: taslak yeni program olur.
    assert.equal(draftConflict(4, null), false);
  });
});

describe('çıkış bağlantısı', () => {
  const here = 'http://localhost:3000/dashboard/clients/c_uc942qx6/program/edit';
  const click = (patch: Partial<LinkClick>): LinkClick => ({
    href: '/dashboard/clients/c_uc942qx6/program',
    target: null,
    download: false,
    button: 0,
    modified: false,
    location: here,
    ...patch,
  });

  test('uygulamanın başka sayfasına giden bağlantı tutulur', () => {
    assert.equal(leaveHref(click({})), '/dashboard/clients/c_uc942qx6/program');
    assert.equal(leaveHref(click({ href: '/dashboard' })), '/dashboard');
    assert.equal(leaveHref(click({ href: 'http://localhost:3000/dashboard/templates?q=a#top' })), '/dashboard/templates?q=a#top');
    assert.equal(leaveHref(click({ href: '../measurements' })), '/dashboard/clients/c_uc942qx6/measurements');
    assert.equal(leaveHref(click({ target: '_self' })), '/dashboard/clients/c_uc942qx6/program');
    // Aynı yol, başka sorgu: sayfa değişir.
    const search = '/dashboard/clients/c_uc942qx6/program/edit?x=1';
    assert.equal(leaveHref(click({ href: search })), search);
  });

  test('sayfadan çıkmayan ya da tarayıcıya bırakılan tıklamalar geçer', () => {
    assert.equal(leaveHref(click({ href: null })), null);
    assert.equal(leaveHref(click({ target: '_blank' })), null);
    assert.equal(leaveHref(click({ download: true })), null);
    assert.equal(leaveHref(click({ modified: true })), null);
    assert.equal(leaveHref(click({ button: 1 })), null);
    assert.equal(leaveHref(click({ href: '#hareketler' })), null);
    assert.equal(leaveHref(click({ href: '/dashboard/clients/c_uc942qx6/program/edit' })), null);
    assert.equal(leaveHref(click({ href: '/dashboard/clients/c_uc942qx6/program/edit#top' })), null);
    assert.equal(leaveHref(click({ href: 'https://github.com/pulsecoach' })), null);
    assert.equal(leaveHref(click({ href: 'mailto:pt@example.com' })), null);
    assert.equal(leaveHref(click({ href: 'javascript:void(0)' })), null);
    assert.equal(leaveHref(click({ href: 'http://[bozuk' })), null);
  });
});
