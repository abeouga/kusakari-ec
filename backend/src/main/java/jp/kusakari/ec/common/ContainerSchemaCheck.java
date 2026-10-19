package jp.kusakari.ec.common;

import javax.sql.DataSource;
import lombok.RequiredArgsConstructor;
import org.flywaydb.core.Flyway;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("container")
@RequiredArgsConstructor
public class ContainerSchemaCheck implements ApplicationRunner {
  private final DataSource database;

  @Override
  public void run(ApplicationArguments arguments) {
    var flyway = Flyway.configure().dataSource(database).cleanDisabled(true).load();
    flyway.validate();
    if (flyway.info().pending().length != 0) {
      throw new IllegalStateException("Pending migrations: run the image's migrate command before serving traffic.");
    }
  }
}
