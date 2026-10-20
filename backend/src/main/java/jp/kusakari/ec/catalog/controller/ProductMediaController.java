package jp.kusakari.ec.catalog.controller;

import java.util.Map;
import jp.kusakari.ec.catalog.service.ProductMediaService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/product-images")
@RequiredArgsConstructor
public class ProductMediaController {

  private final ProductMediaService media;
  private final jp.kusakari.ec.auth.AuthService auth;

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, String> upload(@RequestParam("file") MultipartFile file) {
    auth.requireSellerRole();
    return Map.of("imageUrl", media.upload(file));
  }

  @GetMapping("/{id}")
  public ResponseEntity<byte[]> get(@PathVariable String id) {
    var image = media.get(id);
    return ResponseEntity.ok()
      .contentType(MediaType.parseMediaType(image.contentType()))
      .header("X-Content-Type-Options", "nosniff")
      .body(image.bytes());
  }
}
