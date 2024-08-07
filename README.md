# Backend Engineer Project Test
## Notes
- Database tables can be found on the `migrations.sql` file in the root directory
- Environment variables need to be created in the root directory to start the API. Use the template written on .env.example
- File upload (product image) is stored in this API's directory, as images today are mostly stored in cloud storage like S3/OSS. So I emulated that process and used the API's directory as a mock cloud storage and saved only the filenames on the DB

## To Run This API
1. Migrate the `migrations.sql` to initialize the database
2. Add `.env` file and configure the file based on `.env.example` file
3. Run `npm run start` command to run the API