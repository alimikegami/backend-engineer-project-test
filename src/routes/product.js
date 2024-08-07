import db from "../config/db.js";
import axios from "axios";
import fs from "fs";
import Path from "path";
import { v4 as uuidv4 } from "uuid";

// get all products with pagination
async function getProducts(request, h) {
  try {
    var params = request.query;
    let query =
      "SELECT id, sku, price, stock, title, created_at, (SELECT image_url FROM product_images WHERE product_images.product_id = products.id AND product_images.deleted_at IS NULL LIMIT 1) AS image FROM products";
    if (params.limit !== undefined && params.page !== undefined) {
      const offset = params.limit * (params.page - 1);
      query += ` LIMIT ${request.query.limit} OFFSET ${offset}`;
    }

    const res = await db.query(query);

    let countQuery = "SELECT COUNT(id) total_count FROM products WHERE deleted_at IS NULL";
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

// get product details by ID
async function getProductDetails(request, h) {
  try {
    let query = `SELECT id, sku, price, title, stock, created_at, description FROM products WHERE id = ${request.params.id} AND deleted_at IS NULL`;

    const res = await db.query(query);
    if (res.rows.length === 0) {
      return h
        .response({ success: false, message: "data not found" })
        .code(404);
    }

    const data = res.rows[0];

    query = `SELECT image_url FROM product_images WHERE product_id = ${request.params.id} AND deleted_at IS NULL`;

    const imagesRes = await db.query(query);

    data.images = [];
    for (const image of imagesRes.rows) {
      data.images.push(image.image_url);
    }

    return h.response({ success: true, error: null, data: data });
  } catch (err) {
    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

// delete products and delete the transactions for that product
async function deleteProduct(request, h) {
  try {
    await db.query("BEGIN");

    let query = `UPDATE products SET deleted_at = NOW() WHERE id = ${request.params.id}`;

    const res = await db.query(query);
    if (res.rowCount === 0) {
      await db.query("ROLLBACK");

      return h
        .response({ success: false, message: "product not found" })
        .code(404);
    }

    let trxQuery = `UPDATE transactions SET deleted_at = NOW() WHERE product_id = ${request.params.id}`;
    await db.query(trxQuery);
    
    await db.query("COMMIT");
    return h.response({ success: true, error: null, data: res.rows });
  } catch (err) {
    await db.query("ROLLBACK");

    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

// add new product
async function createProduct(request, h) {
  try {
    const payload = request.payload;
    if (!payload.images) {
      return h
        .response({ success: false, message: "No files uploaded" })
        .code(400);
    }

    const uploadDir = "./uploads";

    // Ensure the upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    const imageName = [];
    await db.query("BEGIN");

    let selectQuery = `SELECT id, sku, price, title, stock, created_at, description FROM products WHERE sku = '${payload.sku}'`;
    let productRes = await db.query(selectQuery);
    if (productRes.rowCount > 0) {
      await db.query("ROLLBACK");
      return h
        .response({
          success: false,
          error: "duplicate sku encountered",
          data: null,
        })
        .code(409);
    }

    const files = Array.isArray(payload.images)
      ? payload.images
      : [payload.images];

    // store uploaded file in uploads dir. For this test, I will store the image locally on the project directory.
    // on production level, cloud storage should be used to store the image, not in the database or the app dir
    const promises = files.map((file) => {
      // this file upload section was assisted by chatgpt -- author notes
      const ext = file.hapi.filename.split(".").pop();
      const filename = uuidv4() + "." + ext;
      const filePath = Path.join(uploadDir, filename);
      const writeStream = fs.createWriteStream(filePath);
      file.pipe(writeStream);

      return new Promise((resolve, reject) => {
        file.on("end", () => {
          imageName.push(filename);
          resolve();
        });
        file.on("error", (err) => {
          reject(new Error(`Error uploading file ${filename}: ${err.message}`));
        });
      });
    });

    const results = await Promise.all(promises);

    const query = {
      text: "INSERT INTO products(sku, price, stock, title, description) VALUES($1, $2, $3, $4, $5) RETURNING id",
      values: [
        payload.sku,
        payload.price,
        payload.stock,
        payload.title,
        payload.description,
      ],
    };

    const res = await db.query(query);

    const productId = res.rows[0].id;

    for (const image of imageName) {
      const insertQuery = {
        text: "INSERT INTO product_images(product_id, image_url) VALUES($1, $2)",
        values: [productId, image],
      };

      await db.query(insertQuery);
    }

    await db.query("COMMIT");
    return h.response({ success: true, error: null, data: null });
  } catch (err) {
    await db.query("ROLLBACK");
    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

// populate the product with dummyjson API
async function insertDummyProduct(request, h) {
  try {
    const response = await axios.get("https://dummyjson.com/products");
    await db.query("BEGIN");

    for (const product of response.data.products) {
      let query = `SELECT id, sku, price, title, stock, created_at, description FROM products WHERE sku = '${product.sku}'`;
      let res = await db.query(query);
      if (res.rowCount > 0) {
        await db.query("ROLLBACK");
        return h
          .response({
            success: false,
            error: "duplicate sku encountered",
            data: null,
          })
          .code(409);
      }

      const insertQuery = {
        text: "INSERT INTO products(sku, price, stock, title, description) VALUES($1, $2, $3, $4, $5) RETURNING id",
        values: [
          product.sku,
          product.price,
          product.stock,
          product.title,
          product.description,
        ],
      };

      res = await db.query(insertQuery);

      const productId = res.rows[0].id;

      for (const image of product.images) {
        const insertQuery = {
          text: "INSERT INTO product_images(product_id, image_url) VALUES($1, $2)",
          values: [productId, image],
        };

        res = await db.query(insertQuery);
      }
    }

    await db.query("COMMIT");
    return h.response({
      success: true,
      data: null,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

async function updateProduct(request, h) {
  try {
    const payload = request.payload;
    const imageName = [];
    await db.query("BEGIN");

    let query = `SELECT id, sku, price, title, stock, created_at, description FROM products WHERE sku = '${payload.sku}'`;
    let productRes = await db.query(query);
    if (productRes.rowCount > 0 && request.params.id != productRes.rows[0].id) {
      await db.query("ROLLBACK");

      return h
        .response({
          success: false,
          error: "duplicate sku encountered",
          data: null,
        })
        .code(409);
    }

    if (payload.images) {
      let query = `UPDATE product_images SET deleted_at = NOW() WHERE product_id = ${request.params.id}`;
      await db.query(query);

      const uploadDir = "./uploads";
      // Ensure the upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }

      const files = Array.isArray(payload.images)
        ? payload.images
        : [payload.images];
      const promises = files.map((file) => {
        const ext = file.hapi.filename.split(".").pop();
        const filename = uuidv4() + "." + ext;
        const filePath = Path.join(uploadDir, filename);
        const writeStream = fs.createWriteStream(filePath);
        file.pipe(writeStream);

        return new Promise((resolve, reject) => {
          file.on("end", () => {
            imageName.push(filename);
            resolve();
          });
          file.on("error", (err) => {
            reject(
              new Error(`Error uploading file ${filename}: ${err.message}`)
            );
          });
        });
      });

      const results = await Promise.all(promises);

      for (const image of imageName) {
        const insertQuery = {
          text: "INSERT INTO product_images(product_id, image_url) VALUES($1, $2)",
          values: [request.params.id, image],
        };
        const res = await db.query(insertQuery);
      }
    }

    const updateQuery = `UPDATE products SET price = ${payload.price}, stock = ${payload.stock}, sku = '${payload.sku}', title = '${payload.title}', description = '${payload.description}' WHERE id = ${request.params.id}`;
    const updateRes = await db.query(updateQuery);
    if (updateRes.rowCount === 0) {
      await db.query("ROLLBACK");
      return h
        .response({ success: false, message: "product not updated" })
        .code(404);
    }

    await db.query("COMMIT");
    return h.response({ success: true, error: null, data: null });
  } catch (err) {
    await db.query("ROLLBACK");
    console.log(err);
    return h
      .response({ success: false, message: "internal server error" })
      .code(500);
  }
}

export default [
  { method: "GET", path: "/products", handler: getProducts },
  { method: "GET", path: "/products/{id}", handler: getProductDetails },
  { method: "DELETE", path: "/products/{id}", handler: deleteProduct },
  {
    method: "POST",
    path: "/products",
    options: {
      handler: createProduct,
      payload: {
        maxBytes: 209715200,
        output: "stream",
        parse: true,
        multipart: true,
      },
    },
  },
  {
    method: "PUT",
    path: "/products/{id}",
    options: {
      handler: updateProduct,
      payload: {
        maxBytes: 209715200,
        output: "stream",
        parse: true,
        multipart: true,
      },
    },
  },
  { method: "GET", path: "/products/populate", handler: insertDummyProduct },
];
