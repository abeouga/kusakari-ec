package jp.kusakari.ec.common;

import java.util.Map;
import java.util.Properties;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** One-shot command from the same image. It neither serves HTTP nor creates AWS resources. */
public final class DeploymentMigration {
  private DeploymentMigration() {}

  public static int run(Map<String, String> env) {
    try {
      var database = new DriverManagerDataSource(required(env, "KUSAKARI_EC_DB_URL"),
        required(env, "KUSAKARI_EC_DB_USER"), required(env, "KUSAKARI_EC_DB_PASSWORD"));
      var properties = new Properties();
      properties.setProperty("sslMode", env.getOrDefault("KUSAKARI_EC_DB_SSL_MODE", "VERIFY_IDENTITY"));
      properties.setProperty("trustCertificateKeyStoreUrl", env.getOrDefault("KUSAKARI_EC_DB_TRUSTSTORE_URL", "file:/app/certs/rds.p12"));
      properties.setProperty("trustCertificateKeyStoreType", "PKCS12");
      properties.setProperty("trustCertificateKeyStorePassword", "changeit");
      properties.setProperty("connectTimeout", "10000");
      properties.setProperty("socketTimeout", "30000");
      database.setConnectionProperties(properties);
      var flyway = Flyway.configure().dataSource(database).cleanDisabled(true).load();
      var info = flyway.info();
      if (info.current() != null && info.pending().length > 0 &&
          !env.getOrDefault("KUSAKARI_EC_MIGRATION_BACKUP_REFERENCE", "").matches(
            "arn:aws(?:-cn|-us-gov)?:rds:[a-z0-9-]+:[0-9]{12}:snapshot:[A-Za-z0-9-]+")) {
        throw new IllegalArgumentException("Existing DB upgrade requires a verified available RDS snapshot ARN.");
      }
      flyway.migrate();
      System.out.println("EC schema migration completed.");
      return 0;
    } catch (Exception error) {
      System.err.println("EC migration rejected or failed (" + error.getClass().getSimpleName() + "). Check configuration, backup and DB access; no schema reset was attempted.");
      return 1;
    }
  }

  private static String required(Map<String, String> env, String name) {
    String value = env.get(name);
    if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + name);
    return value;
  }
}
