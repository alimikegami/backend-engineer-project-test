import db from "../config/db.js";

// add new transaction
async function addTransaction(request, h) {
  try {
    var payload = request.payload;

    await db.query("BEGIN");

    let selectQuery = `SELECT id, sku, price, stock, created_at, description FROM products WHERE sku = '${payload.sku}' AND deleted_at IS NULL`;
    const selectRes = await db.query(selectQuery);
    if (selectRes.rows.length === 0) {
      return h
        .response({ success: false, message: "product not found" })
        .code(404);
    }

    const data = selectRes.rows[0];

    if (data.stock == 0) {
      await db.query("ROLLBACK");
      return h.response({ success: false, message: "the product stock is 0" });
    }

    const insertQuery = {
      text: "INSERT INTO transactions(product_id, quantity, amount) VALUES($1, $2, $3)",
      values: [data.id, payload.quantity, data.price * payload.quantity],
    };

    const insertRes = await db.query(insertQuery);
    let updateQuery = `UPDATE products SET stock = ${
      data.stock - payload.quantity
    } WHERE id = ${data.id}`;

    const updateRes = await db.query(updateQuery);

    await db.query("COMMIT");
    return h.response({ success: true, error: null });
  } catch (err) {
    await db.query("ROLLBACK");
    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

// update transactions, based on the SKU, it will re-calculate the stock and update the stock accordingly based on the request quantity or change the product in the current transaction completely if a different SKU are given in the request
async function updateTransaction(request, h) {
  try {
    var payload = request.payload;

    await db.query("BEGIN");

    let query = `SELECT t.id, p.sku, t.quantity, t.amount FROM transactions t LEFT JOIN products p ON p.id = t.product_id WHERE t.deleted_at IS NULL AND t.id = ${request.params.id}`;
    const queryRes = await db.query(query);
    if (queryRes.rows.length === 0) {
      return h
        .response({ success: false, message: "transaction not found" })
        .code(404);
    }

    const transaction = queryRes.rows[0];
    // if the SKU is still the same
    if (payload.sku == transaction.sku) {
      let selectQuery = `SELECT id, sku, price, stock, created_at, description FROM products WHERE sku = '${payload.sku}' AND deleted_at IS NULL`;
      const selectRes = await db.query(selectQuery);
      if (selectRes.rows.length === 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "product not found" })
          .code(404);
      }

      const product = selectRes.rows[0];
      if (product.stock == 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "the product stock is 0" })
          .code(409);
      }

      const updateTrx = `UPDATE transactions SET quantity = ${
        payload.quantity
      }, amount = ${payload.quantity * product.price} WHERE id = ${
        request.params.id
      }`;
      const updateTrxRes = await db.query(updateTrx);
      if (updateTrxRes.rowCount === 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "transaction not found" })
          .code(404);
      }

      let updateQuery = `UPDATE products SET stock = ${
        product.stock + transaction.quantity - payload.quantity
      } WHERE id = ${product.id}`;
      const updateRes = await db.query(updateQuery);
      if (updateRes.rowCount === 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "product not found" })
          .code(404);
      }
    } else {
      // if the updated SKU is a different product
      let selectQuery = `SELECT id, sku, price, stock, created_at, description FROM products WHERE sku = '${payload.sku}' AND deleted_at IS NULL`;
      const selectRes = await db.query(selectQuery);
      if (selectRes.rows.length === 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "product not found" })
          .code(404);
      }

      const product = selectRes.rows[0];
      if (product.stock == 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "the product stock is 0" })
          .code(409);
      }

      let oldProductSelectQuery = `SELECT id, sku, price, stock, created_at, description FROM products WHERE sku = '${transaction.sku}' AND deleted_at IS NULL`;
      const oldProductSelectQueryRes = await db.query(oldProductSelectQuery);
      if (oldProductSelectQueryRes.rows.length === 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "previous product not found" })
          .code(404);
      }

      const oldProduct = oldProductSelectQueryRes.rows[0];
      let updateOldProduct = `UPDATE products SET stock = ${
        oldProduct.stock + transaction.quantity
      } WHERE id = ${oldProduct.id}`;
      const updateOldProductRes = await db.query(updateOldProduct);
      if (updateOldProductRes.rowCount === 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "product not found" })
          .code(404);
      }

      const updateTrx = `UPDATE transactions SET quantity = ${
        payload.quantity
      }, amount = ${payload.quantity * product.price}, product_id = ${
        product.id
      } WHERE id = ${request.params.id}`;
      const updateTrxRes = await db.query(updateTrx);
      if (updateTrxRes.rowCount === 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "transaction not found" })
          .code(404);
      }

      let updateQuery = `UPDATE products SET stock = ${
        product.stock - payload.quantity
      } WHERE id = ${product.id}`;
      const updateRes = await db.query(updateQuery);
      if (updateRes.rowCount === 0) {
        await db.query("ROLLBACK");
        return h
          .response({ success: false, message: "product not found" })
          .code(404);
      }
    }

    await db.query("COMMIT");
    return h.response({ success: true, error: null });
  } catch (err) {
    await db.query("ROLLBACK");
    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

// get all transactions with paginations
async function getTransactions(request, h) {
  try {
    var params = request.query;
    let query =
      "SELECT t.id, p.sku, t.quantity, t.amount FROM transactions t LEFT JOIN products p ON p.id = t.product_id WHERE t.deleted_at IS NULL";
    if (params.limit !== undefined && params.page !== undefined) {
      const offset = params.limit * (params.page - 1);
      query += ` LIMIT ${request.query.limit} OFFSET ${offset}`;
    }

    const res = await db.query(query);

    let countQuery =
      "SELECT COUNT(id) total_count FROM transactions WHERE deleted_at IS NULL";
    const countRes = await db.query(countQuery);

    return h.response({
      success: true,
      error: null,
      data: res.rows,
      _metadata: {
        total_records: countRes.rows[0].total_count,
        page: params.page,
        limit: params.limit,
      },
    });
  } catch (err) {
    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

// get transaction detail
async function getTransactionsByID(request, h) {
  try {
    let query = `SELECT t.id, p.sku, t.quantity, t.amount FROM transactions t LEFT JOIN products p ON p.id = t.product_id WHERE t.deleted_at IS NULL AND t.id = ${request.params.id}`;

    const res = await db.query(query);
    if (res.rows.length === 0) {
      return h
        .response({ success: false, message: "data not found" })
        .code(404);
    }

    return h.response({ success: true, data: res.rows });
  } catch (err) {
    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

// Delete transaction and restore the stock that has been allocated for that transaction
async function deleteTransaction(request, h) {
  try {
    await db.query("BEGIN");

    let transactionSelectQuery = `SELECT t.id, p.sku, t.quantity, t.amount, t.product_id FROM transactions t LEFT JOIN products p ON p.id = t.product_id WHERE t.deleted_at IS NULL AND t.id = ${request.params.id}`;

    const transaction = await db.query(transactionSelectQuery);
    if (transaction.rows.length === 0) {
      await db.query("ROLLBACK");
      return h
        .response({ success: false, message: "data not found" })
        .code(404);
    }

    let updateProduct = `UPDATE products SET stock = stock + ${transaction.rows[0].quantity} WHERE id = ${transaction.rows[0].product_id}`;
    const productRes = await db.query(updateProduct);
    if (productRes.rowCount === 0) {
      await db.query("ROLLBACK");
      return h
        .response({ success: false, message: "data not found" })
        .code(404);
    }

    let query = `UPDATE transactions SET deleted_at = NOW() WHERE id = ${request.params.id}`;

    const res = await db.query(query);
    if (res.rowCount === 0) {
      await db.query("ROLLBACK");
      return h
        .response({ success: false, message: "data not found" })
        .code(404);
    }

    await db.query("COMMIT");
    return h.response({ success: true, message: "data successfully deleted" });
  } catch (err) {
    console.log(err);
    await db.query("ROLLBACK");
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

export default [
  { method: "POST", path: "/transactions", handler: addTransaction },
  { method: "GET", path: "/transactions", handler: getTransactions },
  { method: "GET", path: "/transactions/{id}", handler: getTransactionsByID },
  { method: "DELETE", path: "/transactions/{id}", handler: deleteTransaction },
  { method: "PUT", path: "/transactions/{id}", handler: updateTransaction },
];
