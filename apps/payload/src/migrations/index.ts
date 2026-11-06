import * as migration_20261106_131628_initial from './20261106_131628_initial';
import * as migration_20261106_142950_acting_user_id from './20261106_142950_acting_user_id';

export const migrations = [
  {
    up: migration_20261106_131628_initial.up,
    down: migration_20261106_131628_initial.down,
    name: '20261106_131628_initial',
  },
  {
    up: migration_20261106_142950_acting_user_id.up,
    down: migration_20261106_142950_acting_user_id.down,
    name: '20261106_142950_acting_user_id'
  },
];
