package jp.kusakari.ec;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class KusakariEcApplication {

  public static void main(String[] args) {
    if (args.length == 1 && args[0].equals("migrate")) {
      System.exit(jp.kusakari.ec.common.DeploymentMigration.run(System.getenv()));
      return;
    }
    SpringApplication.run(KusakariEcApplication.class, args);
  }
}
