import { Controller } from '@nestjs/common';
import { YjsStorageService } from './yjs-storage.service';

@Controller('yjs-storage')
export class YjsStorageController {
  constructor(private readonly yjsService: YjsStorageService) {}
}
