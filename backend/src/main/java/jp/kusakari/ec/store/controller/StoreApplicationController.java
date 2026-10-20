package jp.kusakari.ec.store.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import jp.kusakari.ec.store.service.StoreApplicationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
public class StoreApplicationController {

  private final StoreApplicationService service;

  public record Decision(boolean approved, @NotNull @Size(max = 500) String reason) {}

  @GetMapping("/api/account/store-applications")
  public List<StoreApplicationService.Application> mine() {
    return service.list(false);
  }

  @GetMapping("/api/operator/applications")
  public List<StoreApplicationService.Application> all() {
    return service.list(true);
  }

  @PostMapping(value = "/api/account/store-applications", consumes = "multipart/form-data")
  public StoreApplicationService.Application submit(
    @Valid @RequestPart("application") StoreApplicationService.Input in,
    @RequestPart("document") MultipartFile file
  ) throws java.io.IOException {
    return service.submit(in, file);
  }

  @PutMapping("/api/operator/applications/{id}")
  public StoreApplicationService.Application decide(@PathVariable String id, @Valid @RequestBody Decision in) {
    return service.decide(id, in.approved(), in.reason());
  }

  @GetMapping("/api/account/store-applications/{id}/document")
  public ResponseEntity<byte[]> file(@PathVariable String id) {
    var d = service.document(id);
    return ResponseEntity.ok()
      .header(
        "Content-Disposition",
        ContentDisposition.attachment().filename(d.name(), java.nio.charset.StandardCharsets.UTF_8).build().toString()
      )
      .header("X-Content-Type-Options", "nosniff")
      .cacheControl(CacheControl.noStore())
      .contentType(MediaType.parseMediaType(d.type()))
      .body(d.data());
  }
}
