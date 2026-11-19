const all = ['dashboard','location','checklist','approval','checklist_items','report','analysis','user_management','profile','restroom','restroom_items','project','bin_card','linen','location_categories','waste_management','maintenance','settings'];
const ops = ['dashboard','checklist','approval','report','analysis','profile','restroom','project','bin_card','linen','waste_management','maintenance'];
export const DEFAULT_MENU: Record<string,string[]> = {
  'Super Admin': all, Admin: all, Supervisor: ops, Manager: ops, Leader: ops,
  Staff: ['dashboard','checklist','analysis','profile','restroom','project','bin_card','linen','waste_management','maintenance'],
};
