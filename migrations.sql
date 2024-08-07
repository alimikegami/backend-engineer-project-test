CREATE TABLE public.products (
	id serial4 NOT NULL,
	sku varchar(100) NOT NULL,
	stock int4 NOT NULL DEFAULT 0,
	created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
	deleted_at timestamp NULL,
	description text NULL,
	price numeric NOT NULL,
	title varchar(255) NOT NULL,
	CONSTRAINT products_pkey PRIMARY KEY (id),
	CONSTRAINT products_sku_key UNIQUE (sku)
);

CREATE TABLE public.product_images (
	id serial4 NOT NULL,
	image_url varchar(255) NOT NULL,
	product_id int4 NOT NULL,
	created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
	deleted_at timestamp NULL,
	CONSTRAINT product_images_image_url_key UNIQUE (image_url),
	CONSTRAINT product_images_pkey PRIMARY KEY (id)
);

ALTER TABLE public.product_images ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);

CREATE TABLE public.transactions (
	id serial4 NOT NULL,
	product_id int4 NOT NULL,
	quantity int4 NOT NULL DEFAULT 0,
	amount numeric NOT NULL DEFAULT 0,
	created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
	deleted_at timestamp NULL,
	CONSTRAINT transactions_pkey PRIMARY KEY (id)
);

ALTER TABLE public.transactions ADD CONSTRAINT transactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);