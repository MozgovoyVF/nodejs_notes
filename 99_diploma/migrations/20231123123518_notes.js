/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("notes", (table) => {
    table.increments("id");
    table.string("title", 255).notNullable();
    table.string("text", 1000).notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.boolean('is_archived').notNullable().defaultTo(false);
    table.integer("user_id").notNullable();
    table.foreign("user_id").references("users.id");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("notes");
};
